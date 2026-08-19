import { query } from "./_lib/db.js";
import { authenticateRequest } from "./_lib/auth.js";
import { normalizeDate } from "./_lib/helpers.js";
import { calculateFIFO } from "./_lib/fifo.js";
import { writeAuditLog } from "./_lib/audit.js";

async function getActiveManagerLoans(managerId) {
  return query(
    `SELECT id, loan_type, loan_amount, remaining_amount, loan_date, created_at, status
     FROM manager_loans
     WHERE manager_id = $1 AND is_deleted = false AND status = 'active' AND remaining_amount > 0
     ORDER BY COALESCE(loan_date, created_at::date) ASC, created_at ASC`,
    [managerId],
  );
}

export default async function handler(request, response) {
  try {
    const user = authenticateRequest(request, ["admin"]);
    const tab = request.query.tab || "dashboard";

    // ----------------------------------------------------
    // TAB 1: DASHBOARD
    // ----------------------------------------------------
    if (tab === "dashboard" && request.method === "GET") {
      const [kpis, topManagers, recentActivity, allManagers] = await Promise.all([
        query(`
          SELECT
            COALESCE((SELECT SUM(amount) FROM manager_entries WHERE is_deleted = false AND entry_type = 'loan_given' AND entry_date >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Kolkata')), 0) AS this_month_loans,
            COALESCE((SELECT SUM(amount) FROM manager_entries WHERE is_deleted = false AND entry_type = 'repayment' AND entry_date >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Kolkata')), 0) AS this_month_repayments,
            COALESCE((SELECT SUM(amount) FROM manager_entries WHERE is_deleted = false AND entry_type = 'salary_given' AND entry_date >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Kolkata')), 0) AS this_month_salary,
            COALESCE((SELECT SUM(remaining_amount) FROM manager_loans WHERE is_deleted = false AND status = 'active'), 0) AS total_outstanding
        `),
        query(`
          SELECT u.id, u.full_name AS manager_name, u.phone,
            COALESCE(SUM(ml.loan_amount), 0) AS total_loan,
            COALESCE(SUM(ml.loan_amount - ml.remaining_amount), 0) AS total_repaid,
            COALESCE(SUM(ml.remaining_amount), 0) AS total_outstanding,
            COUNT(CASE WHEN ml.status = 'active' THEN 1 END)::int AS active_loans_count
          FROM users u
          LEFT JOIN manager_loans ml ON ml.manager_id = u.id AND ml.is_deleted = false
          WHERE u.role = 'manager' AND u.is_active = true
          GROUP BY u.id, u.full_name, u.phone
          ORDER BY total_outstanding DESC, u.full_name ASC
          LIMIT 10
        `),
        query(`
          SELECT me.*, u.full_name AS manager_name
          FROM manager_entries me
          JOIN users u ON u.id = me.manager_id
          WHERE me.is_deleted = false
          ORDER BY me.entry_date DESC, me.created_at DESC
          LIMIT 10
        `),
        query(`SELECT id, full_name, phone FROM users WHERE role = 'manager' AND is_active = true ORDER BY full_name`),
      ]);

      return response.json({
        kpis: kpis[0] || {
          this_month_loans: 0,
          this_month_repayments: 0,
          this_month_salary: 0,
          total_outstanding: 0,
        },
        topManagers,
        recentActivity,
        managers: allManagers,
      });
    }

    // ----------------------------------------------------
    // TAB 2 & 3: ENTRIES (LIST, CREATE, DELETE)
    // ----------------------------------------------------
    if (tab === "entries" || tab === "all-entries" || (!request.query.tab && request.method === "POST")) {
      if (request.method === "GET") {
        const page = Math.max(Number(request.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(request.query.limit) || 25, 10), 100);
        const values = [];
        let where = " WHERE me.is_deleted = false";

        if (request.query.managerId) {
          values.push(request.query.managerId);
          where += ` AND me.manager_id = $${values.length}`;
        }
        if (request.query.type) {
          values.push(request.query.type);
          where += ` AND me.entry_type = $${values.length}`;
        }
        if (request.query.days && ["15", "30", "45", "60"].includes(String(request.query.days))) {
          values.push(Number(request.query.days));
          where += ` AND me.entry_date >= ((NOW() AT TIME ZONE 'Asia/Kolkata')::date - ($${values.length} * INTERVAL '1 day'))`;
        }
        const fromDate = normalizeDate(request.query.fromDate);
        if (fromDate) {
          values.push(fromDate);
          where += ` AND me.entry_date >= $${values.length}::date`;
        }
        const toDate = normalizeDate(request.query.toDate);
        if (toDate) {
          values.push(toDate);
          where += ` AND me.entry_date <= $${values.length}::date`;
        }
        if (request.query.minAmount !== undefined && request.query.minAmount !== "") {
          const min = Number(request.query.minAmount);
          if (!isNaN(min)) {
            values.push(min);
            where += ` AND me.amount >= $${values.length}`;
          }
        }
        if (request.query.maxAmount !== undefined && request.query.maxAmount !== "") {
          const max = Number(request.query.maxAmount);
          if (!isNaN(max)) {
            values.push(max);
            where += ` AND me.amount <= $${values.length}`;
          }
        }

        const [countRes, rows] = await Promise.all([
          query(`SELECT COUNT(*)::int AS total FROM manager_entries me${where}`, values),
          query(
            `SELECT me.id, me.entry_date, me.manager_id, me.entry_type, me.amount, me.repayment_mode,
                    me.specific_loan_id, me.remarks, me.created_at, u.full_name AS manager_name
             FROM manager_entries me
             JOIN users u ON u.id = me.manager_id
             ${where}
             ORDER BY me.entry_date DESC, me.created_at DESC
             LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, (page - 1) * limit],
          ),
        ]);

        const total = countRes[0]?.total || 0;
        return response.json({
          entries: rows,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit) || 1,
          },
        });
      }

      if (request.method === "POST") {
        const data = request.body || {};
        const managerId = data.managerId || data.manager_id;
        const amountNum = Number(data.amount || data.loanAmount || data.loan_amount);
        const rawDate = data.entryDate || data.entry_date || data.loanDate || data.loan_date;
        const isoDate = normalizeDate(rawDate) || rawDate;
        const entryType = data.entryType || data.entry_type || (data.loanType ? "loan_given" : "salary_given");
        const repaymentMode = data.repaymentMode || data.repayment_mode || "fifo";
        const specificLoanId = data.specificLoanId || data.specific_loan_id || null;
        const remarks = data.remarks || data.reason || null;

        if (!managerId) return response.status(400).json({ error: "Please select a manager." });
        if (!isoDate) return response.status(400).json({ error: "Please provide a valid entry date." });
        if (!entryType || !["salary_given", "loan_given", "repayment"].includes(entryType)) {
          return response.status(400).json({ error: "Please select a valid transaction type." });
        }
        if (!amountNum || amountNum <= 0) {
          return response.status(400).json({ error: "Amount must be a positive number." });
        }

        const managerRows = await query(`SELECT id, full_name FROM users WHERE id = $1 AND role = 'manager'`, [managerId]);
        if (!managerRows.length) return response.status(400).json({ error: "Selected manager not found." });
        const manager = managerRows[0];

        let repaymentPlan = null;
        if (entryType === "repayment") {
          const loans = await getActiveManagerLoans(manager.id);
          if (!loans.length) {
            return response.status(400).json({ error: "No active loan balance exists for this manager." });
          }
          const totalAvailable = loans.reduce((s, l) => s + Number(l.remaining_amount), 0);
          if (amountNum > totalAvailable) {
            return response.status(400).json({
              error: `Repayment amount (₹${amountNum.toLocaleString("en-IN")}) exceeds total outstanding manager loan balance (₹${totalAvailable.toLocaleString("en-IN")}).`,
            });
          }

          if (repaymentMode === "specific" && specificLoanId) {
            const selectedLoan = loans.find((l) => Number(l.id) === Number(specificLoanId));
            if (!selectedLoan) return response.status(400).json({ error: "Please select a valid active manager loan." });

            const selectedPlan = calculateFIFO([selectedLoan], amountNum);
            if (selectedPlan.unappliedAmount > 0) {
              const remainingLoans = loans.filter((l) => Number(l.id) !== Number(selectedLoan.id));
              const fifoPlan = calculateFIFO(remainingLoans, selectedPlan.unappliedAmount);
              repaymentPlan = {
                allocations: [...selectedPlan.allocations, ...fifoPlan.allocations],
                unappliedAmount: fifoPlan.unappliedAmount,
              };
            } else {
              repaymentPlan = selectedPlan;
            }
          } else {
            repaymentPlan = calculateFIFO(loans, amountNum);
          }

          if (repaymentPlan.unappliedAmount > 0) {
            return response.status(400).json({ error: `Repayment amount exceeds total outstanding loan balance (₹${totalAvailable.toLocaleString("en-IN")}).` });
          }
        }

        const entryRes = await query(
          `INSERT INTO manager_entries (entry_date, manager_id, entry_type, amount, repayment_mode, specific_loan_id, remarks, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() AT TIME ZONE 'Asia/Kolkata') RETURNING *`,
          [
            isoDate,
            manager.id,
            entryType,
            amountNum,
            entryType === "repayment" ? repaymentMode : null,
            entryType === "repayment" && repaymentMode === "specific" ? specificLoanId : null,
            remarks,
            user.id,
          ],
        );
        const entry = entryRes[0];

        if (entryType === "loan_given") {
          await query(
            `INSERT INTO manager_loans (manager_id, loan_type, loan_amount, remaining_amount, reason, loan_date, status, created_by, created_at)
             VALUES ($1, 'regular', $2, $2, $3, $4, 'active', $5, NOW() AT TIME ZONE 'Asia/Kolkata')`,
            [manager.id, amountNum, remarks, isoDate, user.id],
          );
        }

        if (repaymentPlan) {
          for (const alloc of repaymentPlan.allocations) {
            await query(
              `UPDATE manager_loans SET remaining_amount = $1, status = $2 WHERE id = $3`,
              [alloc.loanRemainingAfter, alloc.loanRemainingAfter === 0 ? "paid" : "active", alloc.loanId],
            );
            await query(
              `INSERT INTO manager_loan_repayment_allocations (entry_id, loan_id, amount_applied, loan_remaining_before, loan_remaining_after, created_at)
               VALUES ($1, $2, $3, $4, $5, NOW() AT TIME ZONE 'Asia/Kolkata')`,
              [entry.id, alloc.loanId, alloc.amountApplied, alloc.loanRemainingBefore, alloc.loanRemainingAfter],
            );
          }
        }

        const actionMap = {
          loan_given: "MANAGER_LOAN_GIVEN",
          salary_given: "MANAGER_SALARY_GIVEN",
          repayment: "MANAGER_REPAYMENT",
        };

        await writeAuditLog({
          userId: user.id,
          actionType: actionMap[entryType] || "MANAGER_FINANCE_ENTRY",
          tableName: "manager_entries",
          recordId: entry.id,
          managerId: manager.id,
          amount: amountNum,
          entryType: entryType,
          description: `Manager financial entry (${entryType}) recorded for ${manager.full_name}: ₹${amountNum.toLocaleString("en-IN")}`,
        });

        return response.status(201).json({ entry });
      }

      if (request.method === "DELETE") {
        const id = request.query.id || request.body?.id;
        const confirmText = request.body?.confirmText;
        if (!id) return response.status(400).json({ error: "Entry ID is required." });
        if (confirmText !== "CONFIRM") {
          return response.status(400).json({ error: 'Please type "CONFIRM" to authorize deletion.' });
        }

        const entryRows = await query(`SELECT * FROM manager_entries WHERE id = $1 AND is_deleted = false`, [id]);
        if (!entryRows.length) return response.status(404).json({ error: "Manager entry not found." });
        const entry = entryRows[0];

        // Reverse allocations if repayment
        if (entry.entry_type === "repayment") {
          const allocations = await query(`SELECT * FROM manager_loan_repayment_allocations WHERE entry_id = $1`, [entry.id]);
          for (const alloc of allocations) {
            await query(
              `UPDATE manager_loans
               SET remaining_amount = remaining_amount + $1,
                   status = 'active'
               WHERE id = $2`,
              [alloc.amount_applied, alloc.loan_id],
            );
          }
        } else if (entry.entry_type === "loan_given") {
          // Soft delete corresponding loan
          await query(
            `UPDATE manager_loans
             SET is_deleted = true, deleted_at = NOW() AT TIME ZONE 'Asia/Kolkata', deleted_by = $1, delete_reason = 'Associated manager entry deleted'
             WHERE manager_id = $2 AND loan_amount = $3 AND loan_date = $4 AND is_deleted = false`,
            [user.id, entry.manager_id, entry.amount, entry.entry_date],
          );
        }

        await query(
          `UPDATE manager_entries
           SET is_deleted = true, deleted_at = NOW() AT TIME ZONE 'Asia/Kolkata', deleted_by = $1, delete_reason = $2
           WHERE id = $3`,
          [user.id, request.body?.reason || "Admin manual deletion", id],
        );

        await writeAuditLog({
          userId: user.id,
          actionType: "MANAGER_ENTRY_DELETED",
          tableName: "manager_entries",
          recordId: entry.id,
          managerId: entry.manager_id,
          amount: entry.amount,
          entryType: entry.entry_type,
          description: `Deleted manager entry ID ${entry.id} (${entry.entry_type}) of amount ₹${Number(entry.amount).toLocaleString("en-IN")}`,
        });

        return response.json({ success: true });
      }
    }

    // ----------------------------------------------------
    // TAB 4: LOANS OVERVIEW (LIST, CREATE, DELETE)
    // ----------------------------------------------------
    if (tab === "loans" || tab === "loans-overview") {
      if (request.method === "GET") {
        const values = [];
        let where = " WHERE ml.is_deleted = false";
        let kpiWhere = " WHERE ml.is_deleted = false";
        const kpiValues = [];

        if (request.query.managerId) {
          values.push(request.query.managerId);
          where += ` AND ml.manager_id = $${values.length}`;
          kpiValues.push(request.query.managerId);
          kpiWhere += ` AND ml.manager_id = $${kpiValues.length}`;
        }
        if (request.query.status && ["active", "paid"].includes(request.query.status)) {
          values.push(request.query.status);
          where += ` AND ml.status = $${values.length}`;
        }

        const [kpis, loans, managers] = await Promise.all([
          query(`
            SELECT
              COALESCE(SUM(ml.loan_amount), 0) AS total_loans_amount,
              COALESCE(SUM(ml.remaining_amount), 0) AS total_outstanding,
              COALESCE(SUM(ml.loan_amount - ml.remaining_amount), 0) AS total_repaid,
              COUNT(CASE WHEN ml.status = 'active' THEN 1 END)::int AS active_count,
              COUNT(CASE WHEN ml.status = 'paid' THEN 1 END)::int AS paid_count
            FROM manager_loans ml
            ${kpiWhere}
          `, kpiValues),
          query(`
            SELECT ml.id, ml.manager_id, ml.loan_type, ml.loan_amount, ml.remaining_amount, ml.reason, ml.status,
                   COALESCE(ml.loan_date::text, (ml.created_at AT TIME ZONE 'Asia/Kolkata')::date::text) AS loan_date,
                   ml.created_at, u.full_name AS manager_name,
                   (ml.loan_amount - ml.remaining_amount) AS repaid_amount,
                   CASE WHEN ml.loan_amount > 0 THEN ROUND(((ml.loan_amount - ml.remaining_amount)/ml.loan_amount)*100, 2) ELSE 0 END AS repaid_percentage
            FROM manager_loans ml
            JOIN users u ON u.id = ml.manager_id
            ${where}
            ORDER BY CASE WHEN ml.status = 'active' THEN 0 ELSE 1 END, ml.loan_date DESC, ml.created_at DESC
          `, values),
          query(`SELECT id, full_name FROM users WHERE role = 'manager' AND is_active = true ORDER BY full_name`),
        ]);

        return response.json({
          kpis: kpis[0] || { total_loans_amount: 0, total_outstanding: 0, total_repaid: 0, active_count: 0, paid_count: 0 },
          loans,
          managers,
        });
      }

      if (request.method === "POST") {
        const data = request.body || {};
        const managerId = data.managerId || data.manager_id;
        const amountNum = Number(data.loanAmount || data.amount || data.loan_amount);
        const rawDate = data.loanDate || data.loan_date || data.entryDate || data.entry_date;
        const isoDate = normalizeDate(rawDate) || rawDate || new Date().toISOString().slice(0, 10);
        const loanType = data.loanType === "pre_system" ? "pre_system" : "regular";

        if (!managerId) return response.status(400).json({ error: "Please select a manager." });
        if (!amountNum || amountNum <= 0) return response.status(400).json({ error: "Please enter a valid positive loan amount." });

        const rows = await query(
          `INSERT INTO manager_loans (manager_id, loan_type, loan_amount, remaining_amount, reason, loan_date, status, created_by, created_at)
           VALUES ($1, $2, $3, $3, $4, $5, 'active', $6, NOW() AT TIME ZONE 'Asia/Kolkata') RETURNING *`,
          [managerId, loanType, amountNum, data.reason || (loanType === "pre_system" ? "Pre-system loan balance" : "Manager loan"), isoDate, user.id],
        );

        await writeAuditLog({
          userId: user.id,
          actionType: loanType === "pre_system" ? "MANAGER_PRE_LOAN_CREATED" : "MANAGER_LOAN_GIVEN",
          tableName: "manager_loans",
          recordId: rows[0].id,
          managerId: managerId,
          amount: amountNum,
          description: `Created ${loanType === "pre_system" ? "pre-system" : "regular"} manager loan of ₹${amountNum.toLocaleString("en-IN")}`,
        });

        return response.status(201).json({ loan: rows[0] });
      }

      if (request.method === "DELETE") {
        const id = request.query.id || request.body?.id;
        const confirmText = request.body?.confirmText;
        if (!id) return response.status(400).json({ error: "Loan ID is required." });
        if (confirmText !== "CONFIRM") {
          return response.status(400).json({ error: 'Please type "CONFIRM" to authorize loan deletion.' });
        }

        const loanRows = await query(`SELECT * FROM manager_loans WHERE id = $1 AND is_deleted = false`, [id]);
        if (!loanRows.length) return response.status(404).json({ error: "Manager loan not found." });
        const loan = loanRows[0];

        await query(
          `UPDATE manager_loans
           SET is_deleted = true, deleted_at = NOW() AT TIME ZONE 'Asia/Kolkata', deleted_by = $1, delete_reason = $2
           WHERE id = $3`,
          [user.id, request.body?.reason || "Admin deleted manager loan", id],
        );

        await writeAuditLog({
          userId: user.id,
          actionType: "MANAGER_LOAN_DELETED",
          tableName: "manager_loans",
          recordId: loan.id,
          managerId: loan.manager_id,
          amount: loan.loan_amount,
          description: `Permanently deleted manager loan ID ${loan.id} of amount ₹${Number(loan.loan_amount).toLocaleString("en-IN")}`,
        });

        return response.json({ success: true });
      }
    }

    // ----------------------------------------------------
    // TAB 5: MANAGER FINANCE AUDIT LOGS
    // ----------------------------------------------------
    if (tab === "audit-logs" || tab === "audit") {
      const page = Math.max(Number(request.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(request.query.limit) || 25, 10), 100);
      const values = [];
      let where = " WHERE (a.action_type LIKE 'MANAGER_%' OR a.table_name LIKE 'manager_%')";

      if (request.query.managerId) {
        values.push(request.query.managerId);
        where += ` AND a.manager_id = $${values.length}`;
      }
      if (request.query.actionType) {
        values.push(request.query.actionType);
        where += ` AND a.action_type = $${values.length}`;
      }
      if (request.query.days && ["15", "30", "45", "60"].includes(String(request.query.days))) {
        values.push(Number(request.query.days));
        where += ` AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::date >= ((NOW() AT TIME ZONE 'Asia/Kolkata')::date - ($${values.length} * INTERVAL '1 day'))`;
      }
      const fromDate = normalizeDate(request.query.fromDate);
      if (fromDate) {
        values.push(fromDate);
        where += ` AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $${values.length}::date`;
      }
      const toDate = normalizeDate(request.query.toDate);
      if (toDate) {
        values.push(toDate);
        where += ` AND (a.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $${values.length}::date`;
      }

      const [countRes, rows, managers] = await Promise.all([
        query(`SELECT COUNT(*)::int AS total FROM audit_log a${where}`, values),
        query(
          `SELECT a.*, u.full_name AS user_name, u.role AS user_role, m.full_name AS manager_name
           FROM audit_log a
           LEFT JOIN users u ON u.id = a.user_id
           LEFT JOIN users m ON m.id = a.manager_id
           ${where}
           ORDER BY a.created_at DESC
           LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, limit, (page - 1) * limit],
        ),
        query(`SELECT id, full_name FROM users WHERE role = 'manager' AND is_active = true ORDER BY full_name`),
      ]);

      const total = countRes[0]?.total || 0;
      return response.json({
        logs: rows,
        managers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      });
    }

    return response.status(405).json({ error: "Invalid tab or method not allowed" });
  } catch (error) {
    return response
      .status(error.statusCode || 500)
      .json({ error: error.message || "Server error in manager finance." });
  }
}
