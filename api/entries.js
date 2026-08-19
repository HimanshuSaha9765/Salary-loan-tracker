import { query } from "./_lib/db.js";
import { authenticateRequest } from "./_lib/auth.js";
import { writeAuditLog } from "./_lib/audit.js";
import { getClientIP, isPositiveNumber, normalizeDate } from "./_lib/helpers.js";
import { calculateFIFO, getActiveLoans } from "./_lib/fifo.js";
import { invalidateCache } from "./_lib/cache.js";

function error(response, value) {
  const message = String(value.message || value);
  if (message.includes("REPAYMENT_NO_ACTIVE_LOAN"))
    return response
      .status(400)
      .json({ error: "No active loan balance exists for this employee" });
  if (message.includes("REPAYMENT_EXCEEDS_AVAILABLE:")) {
    const amount = message
      .split("REPAYMENT_EXCEEDS_AVAILABLE:")[1]
      .split(/[\s\n]/)[0];
    return response
      .status(400)
      .json({
        error: `Only ₹${Number(amount).toLocaleString("en-IN")} remains to be repaid`,
      });
  }
  return response
    .status(value.statusCode || 500)
    .json({ error: message || "Server error" });
}

async function canUseEmployee(user, employeeId) {
  const rows = await query(
    `SELECT id, manager_id FROM employees WHERE id = $1 AND is_deleted = false AND is_active = true`,
    [employeeId],
  );
  if (!rows[0])
    throw Object.assign(new Error("Employee not found or inactive"), {
      statusCode: 404,
    });
  if (user.role === "manager" && Number(rows[0].manager_id) !== Number(user.id))
    throw Object.assign(new Error("Employee is not assigned to you"), {
      statusCode: 403,
    });
  return rows[0];
}

export default async function handler(request, response) {
  try {
    const user = authenticateRequest(request);
    if (request.method === "GET") {
      const page = Math.max(Number(request.query.page) || 1, 1);
      const limit = Math.min(Number(request.query.limit) || 30, 30);
      const values = [];
      let where = " WHERE 1=1";
      if (user.role === "manager") {
        values.push(user.id);
        where += ` AND e.manager_id = $${values.length}`;
      }
      if (request.query.employeeId) {
        values.push(request.query.employeeId);
        where += ` AND en.employee_id = $${values.length}`;
      }
      if (request.query.type) {
        values.push(request.query.type);
        where += ` AND en.entry_type = $${values.length}`;
      }
      if (user.role === "admin" && request.query.managerId) {
        values.push(request.query.managerId);
        where += ` AND en.manager_id = $${values.length}`;
      }
      if (request.query.fromDate) {
        const fromIso = normalizeDate(request.query.fromDate) || request.query.fromDate;
        values.push(fromIso);
        where += ` AND en.entry_date >= $${values.length}`;
      }
      if (request.query.toDate) {
        const toIso = normalizeDate(request.query.toDate) || request.query.toDate;
        values.push(toIso);
        where += ` AND en.entry_date <= $${values.length}`;
      }
      if (request.query.minAmount) {
        values.push(request.query.minAmount);
        where += ` AND en.amount >= $${values.length}`;
      }
      if (request.query.maxAmount) {
        values.push(request.query.maxAmount);
        where += ` AND en.amount <= $${values.length}`;
      }
      if (request.query.showDeleted !== "true")
        where += " AND en.is_deleted = false";

      const listValues = [...values, limit, (page - 1) * limit];
      const [totals, entries] = await Promise.all([
        query(
          `SELECT COUNT(*)::int AS total FROM entries en JOIN employees e ON e.id=en.employee_id${where}`,
          values,
        ),
        query(
          `SELECT en.id, en.entry_date::text AS entry_date, en.employee_id, en.manager_id, en.entry_type, en.amount, en.repayment_mode, en.specific_loan_id, en.remarks, en.is_deleted, en.deleted_at, en.deleted_by, en.delete_reason, en.created_at, en.created_by, e.full_name AS employee_name, e.emp_code, u.full_name AS manager_name, c.full_name AS created_by_name FROM entries en JOIN employees e ON e.id=en.employee_id LEFT JOIN users u ON u.id=en.manager_id LEFT JOIN users c ON c.id=en.created_by${where} ORDER BY en.entry_date DESC, en.id DESC LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
          listValues,
        ),
      ]);

      return response.json({
        entries,
        pagination: {
          page,
          limit,
          total: totals[0]?.total || 0,
          pages: Math.ceil((totals[0]?.total || 0) / limit),
        },
      });
    }
    if (request.method === "POST") {
      const data = request.body || {};
      const isoEntryDate = normalizeDate(data.entryDate);
      if (
        !data.employeeId ||
        !["salary_given", "loan_given", "repayment"].includes(data.entryType) ||
        !isPositiveNumber(data.amount) ||
        !isoEntryDate
      )
        return response
          .status(400)
          .json({
            error: "Valid date (DD/MM/YYYY), employee, entry type and amount are required",
          });
      const employee = await canUseEmployee(user, data.employeeId);
      if (
        data.entryType === "repayment" &&
        !["fifo", "specific"].includes(data.repaymentMode)
      )
        return response.status(400).json({ error: "Select repayment mode" });
      let repaymentPlan = null;
      if (data.entryType === "repayment") {
        const loans = await getActiveLoans(employee.id);
        if (loans.length === 0)
          return response
            .status(400)
            .json({ error: "No active loan balance exists for this employee." });
        const totalAvailable = loans.reduce(
          (total, loan) => total + Number(loan.remaining_amount),
          0,
        );
        const amountNum = Number(data.amount);
        if (amountNum > totalAvailable)
          return response
            .status(400)
            .json({
              error: `Repayment amount (₹${amountNum.toLocaleString("en-IN")}) exceeds total outstanding loan balance (₹${totalAvailable.toLocaleString("en-IN")}).`,
            });
        if (data.repaymentMode === "specific") {
          const selectedLoan = loans.find(
            (loan) => Number(loan.id) === Number(data.specificLoanId),
          );
          if (!selectedLoan)
            return response
              .status(400)
              .json({ error: "Please select a valid active loan." });
          const selectedPlan = calculateFIFO([selectedLoan], data.amount);
          if (selectedPlan.unappliedAmount > 0) {
            const remainingLoans = loans.filter(
              (loan) => Number(loan.id) !== Number(selectedLoan.id),
            );
            const fifoPlan = calculateFIFO(
              remainingLoans,
              selectedPlan.unappliedAmount,
            );
            repaymentPlan = {
              allocations: [...selectedPlan.allocations, ...fifoPlan.allocations],
              unappliedAmount: fifoPlan.unappliedAmount,
            };
          } else {
            repaymentPlan = selectedPlan;
          }
        } else {
          repaymentPlan = calculateFIFO(loans, data.amount);
        }
        if (repaymentPlan.unappliedAmount > 0)
          return response
            .status(400)
            .json({ error: `Repayment amount exceeds total outstanding loan balance (₹${totalAvailable.toLocaleString("en-IN")}).` });
      }
      const entryRows = await query(
        `INSERT INTO entries (entry_date,employee_id,manager_id,entry_type,amount,repayment_mode,specific_loan_id,remarks,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW() AT TIME ZONE 'Asia/Kolkata') RETURNING *`,
        [
          isoEntryDate,
          employee.id,
          employee.manager_id,
          data.entryType,
          data.amount,
          data.entryType === "repayment" ? data.repaymentMode : null,
          data.entryType === "repayment" && data.repaymentMode === "specific"
            ? data.specificLoanId
            : null,
          data.remarks || null,
          user.id,
        ],
      );
      const entry = entryRows[0];
      if (data.entryType === "loan_given")
        await query(
          `INSERT INTO loans (employee_id,loan_type,loan_amount,remaining_amount,reason,loan_date,status,created_by,created_at) VALUES ($1,'regular',$2,$2,$3,$4,'active',$5,NOW() AT TIME ZONE 'Asia/Kolkata')`,
          [
            employee.id,
            data.amount,
            data.remarks || null,
            isoEntryDate,
            user.id,
          ],
        );
      if (repaymentPlan) {
        for (const allocation of repaymentPlan.allocations) {
          await query(
            `UPDATE loans SET remaining_amount=$1,status=$2 WHERE id=$3`,
            [
              allocation.loanRemainingAfter,
              allocation.loanRemainingAfter === 0 ? "paid" : "active",
              allocation.loanId,
            ],
          );
          await query(
            `INSERT INTO loan_repayment_allocations (entry_id,loan_id,amount_applied,loan_remaining_before,loan_remaining_after,created_at) VALUES ($1,$2,$3,$4,$5,NOW() AT TIME ZONE 'Asia/Kolkata')`,
            [
              entry.id,
              allocation.loanId,
              allocation.amountApplied,
              allocation.loanRemainingBefore,
              allocation.loanRemainingAfter,
            ],
          );
        }
      }
      await writeAuditLog({
        userId: user.id,
        actionType: entry.entry_type.toUpperCase(),
        tableName: "entries",
        recordId: entry.id,
        employeeId: employee.id,
        managerId: employee.manager_id,
        amount: entry.amount,
        entryType: entry.entry_type,
        newData: entry,
        description: `${entry.entry_type} recorded for employee ${employee.id}`,
        ipAddress: getClientIP(request),
      });
      invalidateCache();
      return response.status(201).json({ entry });
    }
    if (request.method === "DELETE") {
      authenticateRequest(request, ["admin"]);
      const { reason, confirmation } = request.body || {};
      if (!request.query.id || !reason?.trim() || confirmation !== "CONFIRM")
        return response
          .status(400)
          .json({
            error:
              "Enter a deletion reason and type CONFIRM to delete this entry",
          });
      const rows = await query(
        `SELECT * FROM entries WHERE id=$1 AND is_deleted=false`,
        [request.query.id],
      );
      const entry = rows[0];
      if (!entry)
        return response.status(404).json({ error: "Entry not found" });
      if (entry.entry_type === "repayment") {
        const allocations = await query(
          `SELECT * FROM loan_repayment_allocations WHERE entry_id=$1 ORDER BY id`,
          [entry.id],
        );
        for (const allocation of allocations)
          await query(
            `UPDATE loans SET remaining_amount=$1,status='active' WHERE id=$2`,
            [allocation.loan_remaining_before, allocation.loan_id],
          );
        await query(
          `DELETE FROM loan_repayment_allocations WHERE entry_id=$1`,
          [entry.id],
        );
      }
      if (entry.entry_type === "loan_given")
        await query(
          `UPDATE loans SET is_deleted=true,deleted_at=NOW() AT TIME ZONE 'Asia/Kolkata',deleted_by=$1,delete_reason=$2 WHERE id=(SELECT id FROM loans WHERE employee_id=$3 AND loan_type='regular' AND loan_amount=$4 AND loan_date=$5 AND is_deleted=false ORDER BY created_at DESC LIMIT 1)`,
          [
            user.id,
            reason.trim(),
            entry.employee_id,
            entry.amount,
            entry.entry_date,
          ],
        );
      await query(
        `UPDATE entries SET is_deleted=true,deleted_at=NOW() AT TIME ZONE 'Asia/Kolkata',deleted_by=$1,delete_reason=$2 WHERE id=$3`,
        [user.id, reason.trim(), entry.id],
      );
      await writeAuditLog({
        userId: user.id,
        actionType: "ENTRY_DELETED",
        tableName: "entries",
        recordId: entry.id,
        employeeId: entry.employee_id,
        managerId: entry.manager_id,
        amount: entry.amount,
        entryType: entry.entry_type,
        oldData: entry,
        description: `Deleted entry ${entry.id}: ${reason.trim()}`,
        ipAddress: getClientIP(request),
      });
      invalidateCache();
      return response.json({ success: true });
    }
    return response.status(405).json({ error: "Method not allowed" });
  } catch (value) {
    return error(response, value);
  }
}
