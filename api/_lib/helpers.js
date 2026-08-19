import { query } from "./db.js";

export function formatINR(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export async function generateEmpCode() {
  const rows = await query(
    `SELECT emp_code
     FROM employees
     WHERE emp_code ~ '^EMP[0-9]+$'
     ORDER BY CAST(SUBSTRING(emp_code FROM 4) AS INTEGER) DESC
     LIMIT 1`,
  );
  const currentCode = rows[0]?.emp_code || "EMP000";
  const nextNumber = Number(currentCode.slice(3)) + 1;

  return `EMP${String(nextNumber).padStart(3, "0")}`;
}

export function getClientIP(request) {
  const forwarded = request.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return request.socket?.remoteAddress || null;
}

export function getTodayIST() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function isPositiveNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0;
}

export function normalizeDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const match = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/.exec(str);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    let year = match[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  return null;
}

