import { query } from "./_lib/db.js";
import { authenticateRequest } from "./_lib/auth.js";
import { writeAuditLog } from "./_lib/audit.js";
import {
  generateEmpCode,
  getClientIP,
  isPositiveNumber,
  normalizeDate,
} from "./_lib/helpers.js";
import { invalidateCache } from "./_lib/cache.js";

function fail(response, error) {
  return response
    .status(error.statusCode || 500)
    .json({ error: error.message || "Server error" });
}

function employeeScope(user, values) {
  if (user.role === "manager") {
    values.push(user.id);
    return ` AND e.manager_id = $${values.length}`;
  }

  return "";
}

export default async function handler(request, response) {
  try {
    const user = authenticateRequest(request);

    if (request.method === "GET" && request.query.id) {
      const values = [request.query.id];
      const scope = employeeScope(user, values);
      const rows = await query(
        `SELECT e.*, e.join_date::text AS join_date, u.full_name AS manager_name,
          COALESCE((SELECT SUM(remaining_amount) FROM loans l WHERE l.employee_id = e.id AND l.is_deleted = false), 0) AS outstanding
         FROM employees e LEFT JOIN users u ON u.id = e.manager_id
         WHERE e.id = $1 AND e.is_deleted = false${scope}`,
        values,
      );
      return response.json({ employee: rows[0] || null });
    }

    if (request.method === "GET") {
      const page = Math.max(Number(request.query.page) || 1, 1);
      const limit = Math.min(
        Math.max(Number(request.query.limit) || 30, 1),
        30,
      );
      const offset = (page - 1) * limit;
      const values = [];
      let where = " WHERE e.is_deleted = false";
      where += employeeScope(user, values);

      if (request.query.search) {
        values.push(`%${request.query.search.trim()}%`);
        where += ` AND (e.full_name ILIKE $${values.length} OR e.phone ILIKE $${values.length})`;
      }
      if (user.role === "admin" && request.query.managerId) {
        values.push(request.query.managerId);
        where += ` AND e.manager_id = $${values.length}`;
      }
      if (
        request.query.status === "active" ||
        request.query.status === "inactive"
      ) {
        values.push(request.query.status === "active");
        where += ` AND e.is_active = $${values.length}`;
      }

      const sortMap = {
        name_asc: "e.full_name ASC",
        name_desc: "e.full_name DESC",
        loan_high: "outstanding DESC",
        loan_low: "outstanding ASC",
      };
      const order = sortMap[request.query.sort] || "e.full_name ASC";
      const listValues = [...values, limit, offset];

      const [totalRows, employees] = await Promise.all([
        query(
          `SELECT COUNT(*)::int AS total FROM employees e${where}`,
          values,
        ),
        query(
          `SELECT e.id, e.emp_code, e.full_name, e.phone, e.is_active, e.manager_id, u.full_name AS manager_name,
            COALESCE((SELECT SUM(remaining_amount) FROM loans l WHERE l.employee_id = e.id AND l.is_deleted = false), 0) AS outstanding
           FROM employees e LEFT JOIN users u ON u.id = e.manager_id${where}
           ORDER BY ${order} LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
          listValues,
        ),
      ]);

      return response.json({
        employees,
        pagination: {
          page,
          limit,
          total: totalRows[0]?.total || 0,
          pages: Math.ceil((totalRows[0]?.total || 0) / limit),
        },
      });
    }

    if (request.method === "POST") {
      authenticateRequest(request, ["admin", "manager"]);
      const data = request.body || {};
      if (!data.fullName?.trim()) {
        return response.status(400).json({ error: "Full name is required" });
      }
      let managerId = null;
      if (user.role === "manager") {
        managerId = user.id;
      } else {
        const managers = await query(
          `SELECT id FROM users WHERE role = 'manager' AND is_active = true ORDER BY full_name`,
        );
        managerId = data.managerId || null;
        if (managers.length === 1) managerId = managers[0].id;
        if (managers.length > 1 && !managerId)
          return response
            .status(400)
            .json({ error: "Manager selection is required" });
      }
      const empCode = await generateEmpCode();
      const rows = await query(
        `INSERT INTO employees (emp_code, full_name, phone, aadhaar, designation, department, join_date, address, emergency_contact, notes, manager_id, created_by, updated_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,NOW() AT TIME ZONE 'Asia/Kolkata',NOW() AT TIME ZONE 'Asia/Kolkata') RETURNING *`,
        [
          empCode,
          data.fullName.trim(),
          data.phone || null,
          data.aadhaar || null,
          data.designation || null,
          data.department || null,
          normalizeDate(data.joinDate) || null,
          data.address || null,
          data.emergencyContact || null,
          data.notes || null,
          managerId,
          user.id,
        ],
      );
      const employee = rows[0];
      if (isPositiveNumber(data.preSystemLoan)) {
        await query(
          `INSERT INTO loans (employee_id, loan_type, loan_amount, remaining_amount, reason, status, created_by, created_at) VALUES ($1,'pre_system',$2,$2,$3,'active',$4,NOW() AT TIME ZONE 'Asia/Kolkata')`,
          [
            employee.id,
            data.preSystemLoan,
            "Balance before system setup",
            user.id,
          ],
        );
      }
      await writeAuditLog({
        userId: user.id,
        actionType: "EMPLOYEE_CREATED",
        tableName: "employees",
        recordId: employee.id,
        employeeId: employee.id,
        newData: employee,
        description: `Created employee ${employee.full_name}`,
        ipAddress: getClientIP(request),
      });
      invalidateCache();
      return response.status(201).json({ employee });
    }

    if (request.method === "PUT") {
      authenticateRequest(request, ["admin"]);
      const data = request.body || {};
      if (!request.query.id || !data.fullName?.trim())
        return response
          .status(400)
          .json({ error: "Employee ID and full name are required" });
      const before = await query(
        `SELECT * FROM employees WHERE id = $1 AND is_deleted = false`,
        [request.query.id],
      );
      if (!before[0])
        return response.status(404).json({ error: "Employee not found" });
      const rows = await query(
        `UPDATE employees SET full_name=$1, phone=$2, aadhaar=$3, designation=$4, department=$5, join_date=$6, address=$7, emergency_contact=$8, notes=$9, manager_id=$10, is_active=$11, updated_by=$12, updated_at=NOW() AT TIME ZONE 'Asia/Kolkata' WHERE id=$13 RETURNING *`,
        [
          data.fullName.trim(),
          data.phone || null,
          data.aadhaar || null,
          data.designation || null,
          data.department || null,
          normalizeDate(data.joinDate) || null,
          data.address || null,
          data.emergencyContact || null,
          data.notes || null,
          data.managerId || null,
          data.isActive !== false,
          user.id,
          request.query.id,
        ],
      );
      if (data.preSystemLoan !== undefined) {
        const existing = await query(
          `SELECT id,loan_amount,remaining_amount FROM loans WHERE employee_id=$1 AND loan_type='pre_system' AND is_deleted=false LIMIT 1`,
          [request.query.id],
        );
        const amount = Number(data.preSystemLoan);
        if (amount < 0 || !Number.isFinite(amount))
          return response
            .status(400)
            .json({ error: "Pre-system loan must be zero or greater" });
        if (existing[0]) {
          if (amount === 0) {
            await query(
              `UPDATE loans SET is_deleted=true, deleted_at=NOW() AT TIME ZONE 'Asia/Kolkata', deleted_by=$1, delete_reason='Pre-system loan cleared' WHERE id=$2`,
              [user.id, existing[0].id],
            );
          } else {
            const repaid =
              Number(existing[0].loan_amount) -
              Number(existing[0].remaining_amount);
            const remaining = Math.max(0, amount - repaid);
            await query(
              `UPDATE loans SET loan_amount=$1,remaining_amount=$2,status=$3,is_deleted=false WHERE id=$4`,
              [
                amount,
                remaining,
                remaining === 0 ? "paid" : "active",
                existing[0].id,
              ],
            );
          }
        } else if (amount > 0) {
          await query(
            `INSERT INTO loans (employee_id,loan_type,loan_amount,remaining_amount,reason,status,created_by,created_at) VALUES ($1,'pre_system',$2,$2,'Balance before system setup','active',$3,NOW() AT TIME ZONE 'Asia/Kolkata')`,
            [request.query.id, amount, user.id],
          );
        }
      }
      await writeAuditLog({
        userId: user.id,
        actionType: "EMPLOYEE_UPDATED",
        tableName: "employees",
        recordId: rows[0].id,
        employeeId: rows[0].id,
        oldData: before[0],
        newData: rows[0],
        description: `Updated employee ${rows[0].full_name}`,
        ipAddress: getClientIP(request),
      });
      invalidateCache();
      return response.json({ employee: rows[0] });
    }

    if (request.method === "DELETE") {
      authenticateRequest(request, ["admin"]);
      if (!request.query.id || request.body?.confirmation !== "CONFIRM")
        return response
          .status(400)
          .json({ error: "Type CONFIRM to permanently delete this employee" });
      const employeeRows = await query(
        `SELECT id,full_name FROM employees WHERE id=$1 AND is_deleted=false`,
        [request.query.id],
      );
      if (!employeeRows[0])
        return response.status(404).json({ error: "Employee not found" });
      const outstandingRows = await query(
        `SELECT COALESCE(SUM(remaining_amount),0) AS outstanding FROM loans WHERE employee_id=$1 AND is_deleted=false`,
        [request.query.id],
      );
      if (Number(outstandingRows[0].outstanding) > 0)
        return response
          .status(400)
          .json({
            error:
              "Permanent deletion is blocked while an outstanding loan balance exists",
          });
      const entryRows = await query(
        `SELECT COUNT(*)::int AS total FROM entries WHERE employee_id=$1`,
        [request.query.id],
      );
      await query(
        `DELETE FROM loan_repayment_allocations WHERE entry_id IN (SELECT id FROM entries WHERE employee_id=$1)`,
        [request.query.id],
      );
      await query(
        `UPDATE audit_log SET employee_id=NULL WHERE employee_id=$1`,
        [request.query.id],
      );
      await query(`DELETE FROM entries WHERE employee_id=$1`, [
        request.query.id,
      ]);
      await query(`DELETE FROM loans WHERE employee_id=$1`, [request.query.id]);
      await query(`DELETE FROM employees WHERE id=$1`, [request.query.id]);
      await writeAuditLog({
        userId: user.id,
        actionType: "EMPLOYEE_PERMANENTLY_DELETED",
        tableName: "employees",
        recordId: Number(request.query.id),
        description: `Permanently deleted ${employeeRows[0].full_name} and ${entryRows[0].total} related entries`,
        ipAddress: getClientIP(request),
      });
      invalidateCache();
      return response.json({
        success: true,
        deletedEntries: entryRows[0].total,
      });
    }

    return response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return fail(response, error);
  }
}
