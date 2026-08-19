import { scryptSync, timingSafeEqual } from "node:crypto";
import { query } from "./_lib/db.js";
import { generateToken, authenticateRequest } from "./_lib/auth.js";
import { writeAuditLog } from "./_lib/audit.js";
import { getClientIP } from "./_lib/helpers.js";

function sendError(response, error) {
  response
    .status(error.statusCode || 500)
    .json({ error: error.message || "Server error" });
}

function verifyPassword(password, storedValue) {
  const [salt, savedHash] = String(storedValue).split(":");

  if (!salt || !savedHash) {
    return false;
  }

  const inputHash = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(inputHash), Buffer.from(savedHash));
}

export default async function handler(request, response) {
  try {
    if (request.method === "POST" && request.query.action === "login") {
      const { username, password } = request.body || {};

      if (!username || !password) {
        return response
          .status(400)
          .json({ error: "Username and password are required" });
      }

      const rows = await query(
        `SELECT id, username, password, role, full_name, phone
         FROM users WHERE username = $1 AND is_active = true`,
        [String(username).trim().toLowerCase()],
      );
      const user = rows[0];

      if (!user || !verifyPassword(password, user.password)) {
        return response
          .status(401)
          .json({ error: "Invalid username or password" });
      }

      const token = generateToken(user);
      await writeAuditLog({
        userId: user.id,
        actionType: "LOGIN",
        description: `${user.full_name} logged in`,
        ipAddress: getClientIP(request),
      });

      return response
        .status(200)
        .json({
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            fullName: user.full_name,
          },
        });
    }

    if (request.method === "POST" && request.query.action === "logout") {
      const user = authenticateRequest(request);
      await writeAuditLog({
        userId: user.id,
        actionType: "LOGOUT",
        description: `${user.fullName} logged out`,
        ipAddress: getClientIP(request),
      });
      return response.status(200).json({ success: true });
    }

    if (request.method === "GET" && request.query.action === "verify") {
      const user = authenticateRequest(request);
      return response.status(200).json({ user });
    }

    if (request.method === "POST" && request.query.action === "update-admin-profile") {
      const user = authenticateRequest(request, ["admin"]);
      const { username, password, fullName } = request.body || {};

      if (!username || username.trim().length < 3) {
        return response.status(400).json({ error: "Username must be at least 3 characters." });
      }

      const cleanUsername = String(username).trim().toLowerCase();
      const existing = await query(
        `SELECT id FROM users WHERE username = $1 AND id != $2`,
        [cleanUsername, user.id],
      );
      if (existing.length > 0) {
        return response.status(400).json({ error: "This username is already in use." });
      }

      const updates = ["username = $1"];
      const params = [cleanUsername];

      if (fullName && fullName.trim()) {
        params.push(fullName.trim());
        updates.push(`full_name = $${params.length}`);
      }

      if (password && password.trim()) {
        if (password.trim().length < 6) {
          return response.status(400).json({ error: "Password must be at least 6 characters." });
        }
        const { hashPassword } = await import("./_lib/auth.js");
        params.push(hashPassword(password.trim()));
        updates.push(`password = $${params.length}`);
      }

      params.push(user.id);
      const sql = `UPDATE users SET ${updates.join(", ")} WHERE id = $${params.length} AND role = 'admin' RETURNING id, username, full_name, role`;
      const rows = await query(sql, params);

      if (!rows.length) {
        return response.status(404).json({ error: "Admin user not found." });
      }

      const updatedUser = rows[0];
      await writeAuditLog({
        userId: user.id,
        actionType: "ADMIN_PROFILE_UPDATED",
        description: `Admin profile updated (Username: ${updatedUser.username})`,
        ipAddress: getClientIP(request),
      });

      return response.status(200).json({
        success: true,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          fullName: updatedUser.full_name,
          role: updatedUser.role,
        },
      });
    }

    return response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return sendError(response, error);
  }
}
