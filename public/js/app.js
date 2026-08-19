const TOKEN_KEY = "salary_tracker_token";
const USER_KEY = "salary_tracker_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}
export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
export async function apiCall(path, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, {
    ...options,
    headers,
    cache: "no-store",
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Invalid server response" }));
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      window.location.href = "/login";
    }
    throw new Error(data.error || "Request failed");
  }
  return data;
}
export async function requireAuth() {
  const user = getUser();
  const token = getToken();
  if (!user || !token) {
    window.location.href = "/login";
    return null;
  }
  if (user.role === "admin") {
    document.body.classList.add("is-admin");
  }
  return user;
}
export async function requireAdmin() {
  const user = await requireAuth();
  if (user && user.role !== "admin") {
    window.location.href = "/dashboard";
    return null;
  }
  return user;
}
export function formatINR(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function formatDate(value) {
  if (!value) return "—";
  const str = String(value).trim();
  if (str === "—" || str === "null" || str === "undefined") return "—";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split("-");
    return `${day}/${month}/${year}`;
  }
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).formatToParts(d);
      const day = parts.find((p) => p.type === "day")?.value;
      const month = parts.find((p) => p.type === "month")?.value;
      const year = parts.find((p) => p.type === "year")?.value;
      if (day && month && year) return `${day}/${month}/${year}`;
    }
  } catch {}
  const parts = str.slice(0, 10).split("-");
  return parts.length === 3 && parts[0].length === 4
    ? `${parts[2]}/${parts[1]}/${parts[0]}`
    : str;
}
export function formatShortDateIST(value) {
  if (!value) return "Before System";
  const str = String(value).trim();
  if (str === "Before System") return "Before System";

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    const monthName = months[month - 1] || isoMatch[2];
    return `${day} ${monthName} ${year}`;
  }

  const dmyMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(str);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = dmyMatch[3];
    const monthName = months[month - 1] || dmyMatch[2];
    return `${day} ${monthName} ${year}`;
  }

  try {
    const dateObj = new Date(value);
    if (!isNaN(dateObj.getTime())) {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).formatToParts(dateObj);
      const day = parts.find((p) => p.type === "day")?.value;
      const month = parts.find((p) => p.type === "month")?.value;
      const year = parts.find((p) => p.type === "year")?.value;
      if (day && month && year) return `${day} ${month} ${year}`;
    }
  } catch {}

  return str;
}
export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
export function getTodayDate() {
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
export function debounce(callback, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}
export function initTheme() {
  const theme = localStorage.getItem("salary_tracker_theme") || "auto";
  applyTheme(theme);
  return theme;
}
export function applyTheme(theme) {
  document.documentElement.dataset.theme =
    theme === "auto"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.dataset.themeMode = theme;
}
export function cycleTheme() {
  const modes = ["auto", "light", "dark"];
  const current = localStorage.getItem("salary_tracker_theme") || "auto";
  const next = modes[(modes.indexOf(current) + 1) % modes.length];
  localStorage.setItem("salary_tracker_theme", next);
  applyTheme(next);
  return next;
}
export function toggleTheme() {
  return cycleTheme();
}
export function escapeHTML(value) {
  const element = document.createElement("div");
  element.textContent = value ?? "";
  return element.innerHTML;
}
initTheme();
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden")
    sessionStorage.setItem("salary_tracker_hidden_at", String(Date.now()));
});
window.addEventListener("focus", () => {
  const hiddenAt = Number(
    sessionStorage.getItem("salary_tracker_hidden_at") || 0,
  );
  if (hiddenAt && Date.now() - hiddenAt > 86400000) {
    clearSession();
    window.location.href = "/login";
  }
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if ((localStorage.getItem("salary_tracker_theme") || "auto") === "auto")
    applyTheme("auto");
});
