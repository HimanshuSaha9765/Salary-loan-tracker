import { apiCall, clearSession, getUser, cycleTheme } from "./app.js";

const adminLinks = [
  ["dashboard", "📊", "Dashboard", "/dashboard"],
  ["employees", "👥", "Employees", "/employees"],
  ["add-entry", "➕", "Add Entry", "/add-entry"],
  ["entries", "📋", "All Entries", "/entries"],
  ["loans", "🏦", "Loans", "/loans"],
  ["audit-logs", "📜", "Audit Logs", "/audit-logs"],
  ["divider"],
  ["admin", "🔐", "Admin Panel", "/admin"],
  ["managers", "👔", "Managers", "/managers"],
  ["assignments", "🔗", "Assignments", "/assignments"],
  ["manager-finance", "💰", "Manager Finance", "/manager-finance"],
];
const managerLinks = adminLinks.slice(0, 5);
function linksMarkup(links, page) {
  return links
    .map((link) =>
      link[0] === "divider"
        ? '<div class="nav-divider"></div>'
        : `<a class="nav-link ${link[0] === page ? "active" : ""}" href="${link[3]}"><span>${link[1]}</span><span>${link[2]}</span></a>`,
    )
    .join("");
}
function createSidebar(page, user) {
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.id = "sidebar";
  const links = user.role === "admin" ? adminLinks : managerLinks;
  sidebar.innerHTML = `<div class="sidebar-brand"><span class="brand-mark">₹</span><span>Salary Tracker</span></div><nav class="nav-links">${linksMarkup(links, page)}</nav><div class="sidebar-user"><div class="sidebar-user-name">${user.fullName}</div><div class="sidebar-user-meta"><span class="sidebar-role">${user.role}</span><button class="logout-button" id="logout-button">Logout</button></div></div>`;
  document.body.insertBefore(sidebar, document.body.firstChild);
  document.getElementById("logout-button").addEventListener("click", logout);
}
const pageMeta = {
  dashboard: { icon: "📊", title: "Dashboard", tag: "Overview & Analytics" },
  employees: { icon: "👥", title: "Employees", tag: "Workforce Directory" },
  "add-entry": { icon: "➕", title: "Add Entry", tag: "Financial Entry" },
  entries: { icon: "📋", title: "All Entries", tag: "Transactions Ledger" },
  loans: { icon: "🏦", title: "Loans", tag: "Credit & Repayments" },
  "audit-logs": { icon: "📜", title: "Audit Logs", tag: "Security & History" },
  admin: { icon: "🔐", title: "Admin Panel", tag: "System Administration" },
  managers: { icon: "👔", title: "Managers", tag: "Management Team" },
  assignments: { icon: "🔗", title: "Assignments", tag: "Workforce Routing" },
  "manager-finance": { icon: "💰", title: "Manager Finance", tag: "Financial Audits" },
  "employee-detail": { icon: "👤", title: "Employee Profile", tag: "Account Ledger" },
};

function createTopNav(page, user) {
  const meta = pageMeta[page] || {
    icon: "📌",
    title: page.replaceAll("-", " "),
    tag: "Finance Portal",
  };

  const todayFormatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  const top = document.createElement("header");
  top.className = "top-nav";
  top.innerHTML = `
    <div class="top-nav-left">
      <button class="menu-button" id="menu-button" aria-label="Open navigation">☰</button>
      <div class="top-nav-page-badge">
        <span class="top-nav-page-icon">${meta.icon}</span>
        <div class="top-nav-page-text">
          <span class="top-nav-title">${meta.title}</span>
          <span class="top-nav-tag">${meta.tag}</span>
        </div>
      </div>
    </div>
    <div class="top-nav-right">
      <div class="top-nav-pill top-nav-date" title="Indian Standard Time">
        <span class="pill-icon">🗓️</span>
        <span class="pill-text">${todayFormatted}</span>
      </div>
      <div class="top-nav-pill top-nav-user" title="Active Role">
        <span class="pill-icon">${user?.role === "admin" ? "🛡️" : "👔"}</span>
        <span class="pill-text">${user?.role === "admin" ? "Admin" : "Manager"}</span>
      </div>
      <button class="theme-toggle-btn" id="theme-toggle" aria-label="Change theme" title="Toggle Theme (Auto / Light / Dark)">
        <span class="theme-icon">◐</span>
        <span id="theme-mode" class="theme-mode-label">Auto</span>
      </button>
    </div>
  `;
  document.body.appendChild(top);

  document
    .getElementById("menu-button")
    ?.addEventListener("click", toggleSidebar);

  const themeMode = document.getElementById("theme-mode");
  const currentTheme = localStorage.getItem("salary_tracker_theme") || "auto";
  if (themeMode) {
    themeMode.textContent = currentTheme.replace(/^./, (l) => l.toUpperCase());
  }

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const mode = cycleTheme();
    if (themeMode) {
      themeMode.textContent = mode.replace(/^./, (l) => l.toUpperCase());
    }
  });
}
function createBottomNav(page, user) {
  const items =
    user.role === "admin"
      ? [
          ["dashboard", "📊", "Home", "/dashboard"],
          ["employees", "👥", "Employees", "/employees"],
          ["add-entry", "➕", "Add", "/add-entry"],
          ["entries", "📋", "Entries", "/entries"],
          ["admin", "🔐", "Admin", "/admin"],
        ]
      : [
          ["dashboard", "📊", "Home", "/dashboard"],
          ["employees", "👥", "Employees", "/employees"],
          ["add-entry", "➕", "Add", "/add-entry"],
          ["entries", "📋", "Entries", "/entries"],
          ["loans", "🏦", "Loans", "/loans"],
        ];
  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.innerHTML = items
    .map(
      (item) =>
        `<a class="bottom-link ${item[0] === page ? "active" : ""}" href="${item[3]}"><span class="${item[0] === "add-entry" ? "bottom-add" : ""}">${item[1]}</span><span>${item[2]}</span></a>`,
    )
    .join("");
  document.body.appendChild(nav);
}
export function toggleSidebar() {
  document.getElementById("sidebar")?.classList.toggle("open");
  document.getElementById("sidebar-overlay")?.classList.toggle("open");
}
export async function logout() {
  try {
    await apiCall("/api/auth?action=logout", { method: "POST" });
  } catch {}
  clearSession();
  window.location.href = "/login";
}
export function initNav(page) {
  const user = getUser();
  if (!user) return;
  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  overlay.id = "sidebar-overlay";
  overlay.addEventListener("click", toggleSidebar);
  document.body.appendChild(overlay);
  createSidebar(page, user);
  createTopNav(page, user);
  createBottomNav(page, user);
}
