import { query } from "./_lib/db.js";
import { authenticateRequest } from "./_lib/auth.js";
import { normalizeDate } from "./_lib/helpers.js";

export default async function handler(request, response) {
  try {
    const user = authenticateRequest(request, ["admin"]);

    if (request.method === "GET") {
      const page = Math.max(Number(request.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(request.query.limit) || 25, 10), 100);
      const values = [];
      let where = " WHERE 1=1";

      if (request.query.managerId) {
        values.push(request.query.managerId);
        where += ` AND (a.manager_id = $${values.length} OR a.user_id = $${values.length} OR a.employee_id IN (SELECT id FROM employees WHERE manager_id = $${values.length}))`;
      }

      if (request.query.employeeId) {
        values.push(request.query.employeeId);
        where += ` AND a.employee_id = $${values.length}`;
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

      const [countResult, rows] = await Promise.all([
        query(`SELECT COUNT(*)::int AS total FROM audit_log a${where}`, values),
        query(
          `SELECT a.*,
                  u.full_name AS user_name,
                  u.role AS user_role,
                  e.full_name AS employee_name,
                  e.emp_code
           FROM audit_log a
           LEFT JOIN users u ON u.id = a.user_id
           LEFT JOIN employees e ON e.id = a.employee_id
           ${where}
           ORDER BY a.created_at DESC
           LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, limit, (page - 1) * limit],
        ),
      ]);

      const total = countResult[0]?.total || 0;

      return response.json({
        logs: rows,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      });
    }

    if (request.method === "DELETE") {
      const ids = request.body?.ids;
      if (!Array.isArray(ids) || !ids.length) {
        return response.status(400).json({ error: "Log IDs are required for bulk deletion" });
      }
      await query(`DELETE FROM audit_log WHERE id = ANY($1::int[])`, [ids]);
      return response.json({ success: true, count: ids.length });
    }

    return response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return response
      .status(error.statusCode || 500)
      .json({ error: error.message || "Server error" });
  }
}
