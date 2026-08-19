import "dotenv/config";
import jwt from "jsonwebtoken";
import { randomBytes, scryptSync } from "node:crypto";

const TOKEN_EXPIRY = "24h";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function getSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }

  return process.env.JWT_SECRET;
}

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
    },
    getSecret(),
    { expiresIn: TOKEN_EXPIRY },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

export function getBearerToken(request) {
  const header = request.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice(7);
}

export function authenticateRequest(request, roles = []) {
  const token = getBearerToken(request);

  if (!token) {
    const error = new Error("Authentication required");
    error.statusCode = 401;
    throw error;
  }

  try {
    const user = verifyToken(token);

    if (roles.length > 0 && !roles.includes(user.role)) {
      const error = new Error("Access denied");
      error.statusCode = 403;
      throw error;
    }

    return user;
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    error.statusCode = 401;
    throw error;
  }
}
