import { query } from "./_lib/db.js";
import { authenticateRequest } from "./_lib/auth.js";
import { writeAuditLog } from "./_lib/audit.js";
import { invalidateCache } from "./_lib/cache.js";

export default async function handler(request, response) {
  try {
    const user = authenticateRequest(request, ["admin"]);
    if (request.method === "GET") {
      const employees = await query(
        `SELECT e.id,e.emp_code,e.full_name,e.manager_id,u.full_name AS manager_name FROM employees e LEFT JOIN users u ON u.id=e.manager_id WHERE e.is_deleted=false ORDER BY u.full_name NULLS LAST,e.full_name`,
      );
      const managers = await query(
        `SELECT id,full_name FROM users WHERE role='manager' AND is_active=true ORDER BY full_name`,
      );
      return response.json({ employees, managers });
    }
    if (request.method === "PUT") {
      const { employeeId, managerId } = request.body || {};
      if (!employeeId)
        return response.status(400).json({ error: "Employee ID is required" });
      const rows = await query(
        `UPDATE employees SET manager_id=$1,updated_by=$2,updated_at=NOW() AT TIME ZONE 'Asia/Kolkata' WHERE id=$3 AND is_deleted=false RETURNING id,full_name,manager_id`,
        [managerId || null, user.id, employeeId],
      );
      if (!rows[0])
        return response.status(404).json({ error: "Employee not found" });
      await writeAuditLog({
        userId: user.id,
        actionType: "ASSIGNMENT_UPDATED",
        tableName: "employees",
        recordId: rows[0].id,
        employeeId: rows[0].id,
        managerId: rows[0].manager_id,
        newData: rows[0],
        description: `Updated manager assignment for ${rows[0].full_name}`,
      });
      invalidateCache();
      return response.json({ employee: rows[0] });
    }
    return response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return response
      .status(error.statusCode || 500)
      .json({ error: error.message || "Server error" });
  }
}
