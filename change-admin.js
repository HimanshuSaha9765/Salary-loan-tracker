import "dotenv/config";
import { query } from "./api/_lib/db.js";
import { hashPassword } from "./api/_lib/auth.js";

async function main() {
  const args = process.argv.slice(2);
  const newUsername = args[0];
  const newPassword = args[1];
  const newFullName = args[2] || "System Administrator";

  if (!newUsername || !newPassword) {
    console.log(`
=====================================================
  Change Admin Credentials CLI
=====================================================

Usage:
  node change-admin.js <new_username> <new_password> [new_full_name]

Example:
  node change-admin.js myadmin SecurePass123! "Head Administrator"
=====================================================
`);
    process.exit(1);
  }

  const cleanUsername = String(newUsername).trim().toLowerCase();
  const hashedPassword = hashPassword(newPassword.trim());

  console.log(`Updating admin account...`);
  console.log(`Username:  ${cleanUsername}`);
  console.log(`Full Name: ${newFullName}`);

  const existingAdmin = await query(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`);

  if (existingAdmin.length > 0) {
    const adminId = existingAdmin[0].id;
    await query(
      `UPDATE users
       SET username = $1, password = $2, full_name = $3, is_active = true
       WHERE id = $4`,
      [cleanUsername, hashedPassword, newFullName, adminId],
    );
    console.log(`\n✅ Admin account ID #${adminId} updated successfully!`);
  } else {
    await query(
      `INSERT INTO users (username, password, role, full_name, is_active)
       VALUES ($1, $2, 'admin', $3, true)`,
      [cleanUsername, hashedPassword, newFullName],
    );
    console.log(`\n✅ Admin account created successfully!`);
  }

  console.log(`\nYou can now sign in at http://localhost:3000/login.html with:`);
  console.log(`  Username: ${cleanUsername}`);
  console.log(`  Password: (as specified)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error updating admin credentials:", err.message);
  process.exit(1);
});
