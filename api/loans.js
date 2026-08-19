import { query } from "./_lib/db.js";
import { authenticateRequest } from "./_lib/auth.js";
import { normalizeDate } from "./_lib/helpers.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "GET")
      return response.status(405).json({ error: "Method not allowed" });
    const user = authenticateRequest(request);
    const values = [];
    let where = " WHERE l.is_deleted = false";
    let summaryWhere = " WHERE l.is_deleted = false";
    const summaryValues = [];

    if (user.role === "manager") {
      values.push(user.id);
      where += ` AND e.manager_id=$${values.length}`;
      summaryValues.push(user.id);
      summaryWhere += ` AND e.manager_id=$${summaryValues.length}`;
    }
    if (request.query.employeeId) {
      values.push(request.query.employeeId);
      where += ` AND l.employee_id=$${values.length}`;
      summaryValues.push(request.query.employeeId);
      summaryWhere += ` AND l.employee_id=$${summaryValues.length}`;
    }
    if (user.role === "admin" && request.query.managerId) {
      values.push(request.query.managerId);
      where += ` AND e.manager_id=$${values.length}`;
      summaryValues.push(request.query.managerId);
      summaryWhere += ` AND e.manager_id=$${summaryValues.length}`;
    }
    if (request.query.status) {
      values.push(request.query.status);
      where += ` AND l.status=$${values.length}`;
    }
    if (request.query.loanType) {
      values.push(request.query.loanType);
      where += ` AND l.loan_type=$${values.length}`;
      summaryValues.push(request.query.loanType);
      summaryWhere += ` AND l.loan_type=$${summaryValues.length}`;
    }
    if (request.query.fromDate) {
      const fromIso = normalizeDate(request.query.fromDate) || request.query.fromDate;
      values.push(fromIso);
      where += ` AND l.loan_date >= $${values.length}`;
      summaryValues.push(fromIso);
      summaryWhere += ` AND l.loan_date >= $${summaryValues.length}`;
    }
    if (request.query.toDate) {
      const toIso = normalizeDate(request.query.toDate) || request.query.toDate;
      values.push(toIso);
      where += ` AND l.loan_date <= $${values.length}`;
      summaryValues.push(toIso);
      summaryWhere += ` AND l.loan_date <= $${summaryValues.length}`;
    }

    const [summary, loans] = await Promise.all([
      query(
        `SELECT
          COALESCE(SUM(CASE WHEN l.status='active' THEN 1 ELSE 0 END),0)::int AS active_count,
          COALESCE(SUM(CASE WHEN l.status='paid' THEN 1 ELSE 0 END),0)::int AS paid_count,
          COALESCE(SUM(l.remaining_amount),0) AS total_outstanding,
          COALESCE(SUM(l.loan_amount-l.remaining_amount),0) AS total_repaid
         FROM loans l JOIN employees e ON e.id=l.employee_id${summaryWhere}`,
        summaryValues,
      ),
      query(
        `SELECT l.id, l.employee_id, l.loan_type, l.loan_amount, l.remaining_amount, l.reason, l.status, l.is_deleted,
          COALESCE(l.loan_date::text, (l.created_at AT TIME ZONE 'Asia/Kolkata')::date::text, l.created_at::date::text) AS loan_date,
          TO_CHAR(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
          e.full_name AS employee_name, e.emp_code, u.full_name AS manager_name,
          (l.loan_amount-l.remaining_amount) AS repaid_amount,
          CASE WHEN l.loan_amount>0 THEN ROUND(((l.loan_amount-l.remaining_amount)/l.loan_amount)*100,2) ELSE 0 END AS repaid_percentage
         FROM loans l JOIN employees e ON e.id=l.employee_id LEFT JOIN users u ON u.id=e.manager_id${where}
         ORDER BY CASE WHEN l.status='active' THEN 0 ELSE 1 END, COALESCE(l.loan_date, (l.created_at AT TIME ZONE 'Asia/Kolkata')::date) DESC, l.created_at DESC`,
        values,
      ),
    ]);

    return response.json({ loans, summary: summary[0] || {} });
  } catch (error) {
    return response
      .status(error.statusCode || 500)
      .json({ error: error.message || "Server error" });
  }
}

