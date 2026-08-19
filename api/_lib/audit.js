import { query } from "./db.js";

export async function writeAuditLog({
  userId = null,
  actionType,
  tableName = null,
  recordId = null,
  employeeId = null,
  managerId = null,
  amount = null,
  entryType = null,
  oldData = null,
  newData = null,
  description,
  ipAddress = null,
}) {
  await query(
    `INSERT INTO audit_log (
      user_id, action_type, table_name, record_id, employee_id,
      manager_id, amount, entry_type, old_data, new_data,
      description, ip_address, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9::jsonb, $10::jsonb, $11, $12,
      NOW() AT TIME ZONE 'Asia/Kolkata'
    )`,
    [
      userId,
      actionType,
      tableName,
      recordId,
      employeeId,
      managerId,
      amount,
      entryType,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      description,
      ipAddress,
    ],
  );
}
