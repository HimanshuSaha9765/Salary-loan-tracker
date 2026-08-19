import "dotenv/config";
import { query } from "./api/_lib/db.js";
import { invalidateCache } from "./api/_lib/cache.js";

async function resetDatabase() {
  console.log("=====================================================");
  console.log("  ⚠️  DATABASE FULL RESET (FRESH START)");
  console.log("=====================================================\n");

  console.log("1. Cleaning all transactions, allocations, and entries...");
  await query("TRUNCATE TABLE manager_loan_repayment_allocations CASCADE");
  await query("TRUNCATE TABLE manager_entries CASCADE");
  await query("TRUNCATE TABLE manager_loans CASCADE");
  await query("TRUNCATE TABLE manager_loan_repayments CASCADE");
  await query("TRUNCATE TABLE loan_repayment_allocations CASCADE");
  await query("TRUNCATE TABLE entries CASCADE");
  await query("TRUNCATE TABLE loans CASCADE");

  console.log("2. Cleaning audit logs...");
  await query("TRUNCATE TABLE audit_log CASCADE");

  console.log("3. Cleaning workforce employees and non-admin manager accounts...");
  await query("TRUNCATE TABLE employees CASCADE");
  await query("DELETE FROM users WHERE role != 'admin'");

  console.log("4. Resetting auto-increment sequence counters...");
  const sequences = [
    "manager_loan_repayment_allocations_id_seq",
    "manager_entries_id_seq",
    "manager_loans_id_seq",
    "manager_loan_repayments_id_seq",
    "loan_repayment_allocations_id_seq",
    "entries_id_seq",
    "loans_id_seq",
    "audit_log_id_seq",
    "employees_id_seq",
  ];

  for (const seq of sequences) {
    try {
      await query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
    } catch (e) {
      // Ignore if sequence name differs
    }
  }

  console.log("5. Clearing in-memory caches...");
  invalidateCache();

  const adminUsers = await query("SELECT id, username, role, full_name FROM users WHERE role = 'admin'");
  console.log("\n✅ DATABASE CLEANED SUCCESSFULLY!");
  console.log("-----------------------------------------------------");
  console.log("Active Admin Accounts:");
  console.table(adminUsers);
  console.log("-----------------------------------------------------");
  console.log("The database is now 100% clean and ready for fresh production use!");
  process.exit(0);
}

resetDatabase().catch((err) => {
  console.error("❌ Reset failed:", err.message);
  process.exit(1);
});
