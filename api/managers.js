import { randomBytes, scryptSync } from "node:crypto";
import { query } from "./_lib/db.js";
import { authenticateRequest } from "./_lib/auth.js";
import { writeAuditLog } from "./_lib/audit.js";
import { getTodayIST } from "./_lib/helpers.js";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export default async function handler(request, response) {
  try {
    const user = authenticateRequest(request, ["admin"]);
    if (request.method === "GET") {
      const managers = await query(
        `SELECT u.id,u.full_name,u.username,u.phone,u.is_active,COUNT(e.id)::int AS team_size,COALESCE((SELECT SUM(ml.remaining_amount) FROM manager_loans ml WHERE ml.manager_id=u.id AND ml.is_deleted=false),0) AS outstanding,COALESCE((SELECT ml.loan_amount FROM manager_loans ml WHERE ml.manager_id=u.id AND ml.reason='Balance before system setup' AND ml.is_deleted=false ORDER BY ml.id DESC LIMIT 1),0) AS pre_system_loan FROM users u LEFT JOIN employees e ON e.manager_id=u.id AND e.is_deleted=false WHERE u.role='manager' GROUP BY u.id ORDER BY u.full_name`,
      );
      return response.json({ managers });
    }
    const data = request.body || {};
    if (request.method === "POST") {
      if (!data.fullName?.trim() || !data.username?.trim() || !data.password)
        return response
          .status(400)
          .json({ error: "Name, username and password are required" });
      const username = data.username.trim().toLowerCase().replace(/\s+/g, "_");
      const rows = await query(
        `INSERT INTO users (full_name,username,password,phone,role,created_by,created_at) VALUES ($1,$2,$3,$4,'manager',$5,NOW() AT TIME ZONE 'Asia/Kolkata') RETURNING id,full_name,username,phone,role,is_active,created_at`,
        [
          data.fullName.trim(),
          username,
          hashPassword(data.password),
          data.phone || null,
          user.id,
        ],
      );
      const manager = rows[0];
      if (Number(data.preSystemLoan) > 0)
        await query(
          `INSERT INTO manager_loans (manager_id,loan_amount,remaining_amount,reason,loan_date,status,created_by,created_at) VALUES ($1,$2,$2,'Balance before system setup',$3,'active',$4,NOW() AT TIME ZONE 'Asia/Kolkata')`,
          [manager.id, data.preSystemLoan, getTodayIST(), user.id],
        );
      await writeAuditLog({
        userId: user.id,
        actionType: "MANAGER_CREATED",
        tableName: "users",
        recordId: manager.id,
        managerId: manager.id,
        newData: manager,
        description: `Created manager ${manager.full_name}`,
      });
      return response.status(201).json({ manager });
    }
    if (request.method === "PUT") {
      if (!request.query.id || !data.fullName?.trim() || !data.username?.trim())
        return response
          .status(400)
          .json({ error: "Manager ID, name and username are required" });
      const username = data.username.trim().toLowerCase().replace(/\s+/g, "_");
      const params = [
        data.fullName.trim(),
        username,
        data.phone || null,
        data.isActive !== false,
        request.query.id,
      ];
      let passwordSql = "";
      if (data.password) {
        params.splice(3, 0, hashPassword(data.password));
        passwordSql = ", password=$4";
        params[4] = data.isActive !== false;
        params[5] = request.query.id;
      }
      const rows = await query(
        `UPDATE users SET full_name=$1,username=$2,phone=$3${passwordSql},is_active=$${data.password ? 5 : 4} WHERE id=$${data.password ? 6 : 5} AND role='manager' RETURNING id,full_name,username,phone,is_active`,
        params,
      );
      if (!rows[0])
        return response.status(404).json({ error: "Manager not found" });
      if (data.preSystemLoan !== undefined) {
        const amount = Number(data.preSystemLoan);
        if (!Number.isFinite(amount) || amount < 0)
          return response
            .status(400)
            .json({ error: "Pre-system loan must be zero or greater" });
        const existing = await query(
          `SELECT id,loan_amount,remaining_amount FROM manager_loans WHERE manager_id=$1 AND (loan_type='pre_system' OR reason='Balance before system setup') AND is_deleted=false ORDER BY id DESC LIMIT 1`,
          [request.query.id],
        );
        if (existing[0]) {
          if (amount === 0) {
            await query(
              `UPDATE manager_loans SET is_deleted=true, deleted_at=NOW() AT TIME ZONE 'Asia/Kolkata', deleted_by=$1, delete_reason='Pre-system loan cleared' WHERE id=$2`,
              [user.id, existing[0].id],
            );
          } else {
            const repaid =
              Number(existing[0].loan_amount) -
              Number(existing[0].remaining_amount);
            const remaining = Math.max(0, amount - repaid);
            await query(
              `UPDATE manager_loans SET loan_amount=$1,remaining_amount=$2,status=$3,loan_type='pre_system' WHERE id=$4`,
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
            `INSERT INTO manager_loans (manager_id,loan_type,loan_amount,remaining_amount,reason,loan_date,status,created_by,created_at) VALUES ($1,'pre_system',$2,$2,'Balance before system setup',$3,'active',$4,NOW() AT TIME ZONE 'Asia/Kolkata')`,
            [request.query.id, amount, getTodayIST(), user.id],
          );
        }
      }
      await writeAuditLog({
        userId: user.id,
        actionType: "MANAGER_UPDATED",
        tableName: "users",
        recordId: rows[0].id,
        managerId: rows[0].id,
        newData: rows[0],
        description: `Updated manager ${rows[0].full_name}`,
      });
      return response.json({ manager: rows[0] });
    }
    if (request.method === "DELETE") {
      if (!request.query.id || data.confirmation !== "CONFIRM")
        return response
          .status(400)
          .json({ error: "Type CONFIRM to permanently delete this manager" });
      const rows = await query(
        `SELECT id,full_name FROM users WHERE id=$1 AND role='manager'`,
        [request.query.id],
      );
      if (!rows[0])
        return response.status(404).json({ error: "Manager not found" });
      const loans = await query(
        `SELECT COUNT(*)::int AS total FROM manager_loans WHERE manager_id=$1`,
        [request.query.id],
      );
      if (loans[0].total > 0)
        return response
          .status(400)
          .json({
            error:
              "Permanent deletion is blocked because this manager has loan records",
          });
      await query(`UPDATE employees SET manager_id=NULL WHERE manager_id=$1`, [
        request.query.id,
      ]);
      await query(
        `UPDATE audit_log SET user_id=NULL,manager_id=NULL WHERE user_id=$1 OR manager_id=$1`,
        [request.query.id],
      );
      await query(`DELETE FROM users WHERE id=$1`, [request.query.id]);
      await writeAuditLog({
        userId: user.id,
        actionType: "MANAGER_PERMANENTLY_DELETED",
        tableName: "users",
        recordId: Number(request.query.id),
        description: `Permanently deleted manager ${rows[0].full_name}`,
      });
      return response.json({ success: true });
    }
    return response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return response
      .status(error.statusCode || 500)
      .json({ error: error.message || "Server error" });
  }
}
