import { query } from "./_lib/db.js";
import { authenticateRequest } from "./_lib/auth.js";
import { getCache, setCache } from "./_lib/cache.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "GET")
      return response.status(405).json({ error: "Method not allowed" });
    const user = authenticateRequest(request);
    const cacheKey = `dashboard:${user.role}:${user.id}`;
    const cached = getCache(cacheKey);
    if (cached) return response.json(cached);

    const values = [];
    let scope = "";
    if (user.role === "manager") {
      values.push(user.id);
      scope = ` AND e.manager_id=$1`;
    }
    const [
      outstanding,
      salary,
      repayments,
      employeeCount,
      loans,
      entries,
    ] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(l.remaining_amount),0) AS total FROM loans l JOIN employees e ON e.id=l.employee_id WHERE l.is_deleted=false${scope}`,
        values,
      ),
      query(
        `SELECT COALESCE(SUM(en.amount),0) AS total FROM entries en JOIN employees e ON e.id=en.employee_id WHERE en.is_deleted=false AND en.entry_type='salary_given' AND date_trunc('month',en.entry_date)=date_trunc('month',CURRENT_DATE)${scope}`,
        values,
      ),
      query(
        `SELECT COALESCE(SUM(en.amount),0) AS total FROM entries en JOIN employees e ON e.id=en.employee_id WHERE en.is_deleted=false AND en.entry_type='repayment' AND date_trunc('month',en.entry_date)=date_trunc('month',CURRENT_DATE)${scope}`,
        values,
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM employees e WHERE e.is_deleted=false AND e.is_active=true${scope}`,
        values,
      ),
      query(
        `SELECT e.id,e.full_name,e.emp_code,COALESCE(SUM(l.remaining_amount),0) AS outstanding FROM employees e JOIN loans l ON l.employee_id=e.id WHERE l.is_deleted=false${scope} GROUP BY e.id ORDER BY outstanding DESC LIMIT 10`,
        values,
      ),
      query(
        `SELECT en.id, en.entry_date::text AS entry_date, en.entry_type, en.amount, en.remarks, e.full_name AS employee_name, e.emp_code FROM entries en JOIN employees e ON e.id=en.employee_id WHERE en.is_deleted=false${scope} ORDER BY en.entry_date DESC,en.id DESC LIMIT 10`,
        values,
      ),
    ]);

    const payload = {
      kpis: {
        outstanding: outstanding[0]?.total || 0,
        salary: salary[0]?.total || 0,
        repayments: repayments[0]?.total || 0,
        activeEmployees: employeeCount[0]?.total || 0,
      },
      loans,
      entries,
    };
    setCache(cacheKey, payload, 30);
    return response.json(payload);
  } catch (error) {
    return response
      .status(error.statusCode || 500)
      .json({ error: error.message || "Server error" });
  }
}
