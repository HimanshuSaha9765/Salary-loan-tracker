import { apiCall, formatDate, formatINR, requireAuth } from "../app.js";
import { initNav } from "../nav.js";
import { escapeHTML } from "../app.js";
const user = await requireAuth();
if (user) {
  initNav("dashboard");
  document.getElementById("page-title").textContent =
    user.role === "admin" ? "System Dashboard" : "My Team Dashboard";
  const data = await apiCall("/api/dashboard");
  document.getElementById("kpi-grid").innerHTML = [
    ["Total Outstanding Loans", data.kpis.outstanding, "danger"],
    ["This Month Salary", data.kpis.salary, ""],
    ["This Month Repayments", data.kpis.repayments, "success"],
    ["Active Employees", data.kpis.activeEmployees, "neutral"],
  ]
    .map(
      (item) =>
        `<div class="card kpi-card ${item[2]}"><span class="kpi-label">${item[0]}</span><div class="kpi-value">${item[0] === "Active Employees" ? item[1] : formatINR(item[1])}</div></div>`,
    )
    .join("");
  document.getElementById("loans-body").innerHTML =
    data.loans
      .map(
        (row) =>
          `<tr><td><a class="cell-title" href="/employee-detail?id=${row.id}">${escapeHTML(row.full_name)}<span class="cell-meta">${row.emp_code}</span></a></td><td class="text-danger">${formatINR(row.outstanding)}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="2" class="empty-state">No loans found.</td></tr>';
  document.getElementById("entries-body").innerHTML =
    data.entries
      .map(
        (row) =>
          `<tr><td>${formatDate(row.entry_date)}</td><td>${escapeHTML(row.employee_name)}</td><td><span class="badge badge-primary">${row.entry_type}</span></td><td>${formatINR(row.amount)}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="4" class="empty-state">No entries found.</td></tr>';
}
