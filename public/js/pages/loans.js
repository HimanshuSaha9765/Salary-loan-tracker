import {
  apiCall,
  escapeHTML,
  formatDate,
  formatINR,
  requireAuth,
} from "../app.js";
import { initNav } from "../nav.js";

const user = await requireAuth();
let cachedLoans = [];

if (user) {
  initNav("loans");

  if (user.role !== "admin") {
    document.querySelectorAll(".manager-only").forEach((element) => element.remove());
  }

  const initialData = await loadDropdowns().catch(() => null);
  bindFilters();
  loadLoans(initialData);
  loadManagers();
}

async function loadDropdowns() {
  const data = await apiCall("/api/loans");
  cachedLoans = data.loans;
  const employees = [
    ...new Map(
      cachedLoans.map((loan) => [
        loan.employee_id,
        { id: loan.employee_id, name: loan.employee_name, code: loan.emp_code },
      ]),
    ).values(),
  ];
  document.getElementById("employee-filter").innerHTML =
    '<option value="">All employees with loans</option>' +
    employees
      .map(
        (employee) =>
          `<option value="${employee.id}">${escapeHTML(employee.name)} · ${employee.code}</option>`,
      )
      .join("");
  return data;
}

async function loadManagers() {
  if (user.role !== "admin") return;
  try {
    const managers = await apiCall("/api/managers");
    document.getElementById("manager-filter").innerHTML =
      '<option value="">All managers</option>' +
      managers.managers
        .map(
          (manager) =>
            `<option value="${manager.id}">${escapeHTML(manager.full_name)}</option>`,
        )
        .join("");
  } catch {}
}

function bindFilters() {
  document
    .querySelectorAll(".filter-bar select")
    .forEach((element) =>
      element.addEventListener("change", () => loadLoans()),
    );
  document
    .getElementById("clear-loan-filters")
    .addEventListener("click", () => {
      document
        .querySelectorAll(".filter-bar select")
        .forEach((element) => (element.selectedIndex = 0));
      loadLoans();
    });
}

function queryString() {
  const params = new URLSearchParams();
  const map = [
    ["employee-filter", "employeeId"],
    ["manager-filter", "managerId"],
    ["status-filter", "status"],
    ["type-filter", "loanType"],
  ];
  map.forEach(([id, key]) => {
    const value = document.getElementById(id)?.value;
    if (value) params.set(key, value);
  });
  return params.toString();
}
function progressClass(value) {
  return value < 33 ? "low" : value < 67 ? "medium" : "";
}
async function loadLoans(initialData = null) {
  const body = document.getElementById("loans-body");
  if (!initialData)
    body.innerHTML =
      '<tr class="skeleton-row"><td colspan="9"><span class="skeleton"></span></td></tr><tr class="skeleton-row"><td colspan="9"><span class="skeleton"></span></td></tr>';
  try {
    const data = initialData || (await apiCall(`/api/loans?${queryString()}`));
    const summary = data.summary;
    document.getElementById("loan-kpis").innerHTML = [
      ["Active Loans", summary.active_count, "danger"],
      ["Outstanding Balance", formatINR(summary.total_outstanding), "danger"],
      ["Fully Repaid", summary.paid_count, "success"],
      ["Total Repaid", formatINR(summary.total_repaid), "success"],
    ]
      .map(
        (item) =>
          `<div class="card kpi-card ${item[2]}"><span class="kpi-label">${item[0]}</span><span class="kpi-value">${item[1]}</span></div>`,
      )
      .join("");
    body.innerHTML =
      data.loans
        .map((loan) => {
          const percent = Number(loan.repaid_percentage);
          return `<tr class="row-clickable" onclick="location.href='/employee-detail?id=${loan.employee_id}'"><td><strong>${escapeHTML(loan.employee_name)}</strong><span class="cell-meta">${loan.emp_code}</span></td><td>${escapeHTML(loan.manager_name || "Unassigned")}</td><td><span class="badge ${loan.loan_type === "pre_system" ? "badge-warning" : "badge-primary"}">${loan.loan_type === "pre_system" ? "Before System" : "Regular"}</span></td><td>${loan.loan_type === "pre_system" ? "Before System" : formatDate(loan.loan_date)}</td><td>${formatINR(loan.loan_amount)}</td><td class="text-success">${formatINR(loan.repaid_amount)}</td><td class="${Number(loan.remaining_amount) > 0 ? "text-danger" : "text-success"}"><strong>${formatINR(loan.remaining_amount)}</strong></td><td style="min-width:130px"><div class="progress"><div class="progress-bar ${progressClass(percent)}" style="width:${percent}%"></div></div><span class="cell-meta">${Math.round(percent)}% repaid</span></td><td><span class="badge ${loan.status === "active" ? "badge-warning" : "badge-success"}">${loan.status}</span></td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="9" class="empty-state">No loans match the selected filters.</td></tr>';
  } catch (error) {
    body.innerHTML =
      '<tr><td colspan="9" class="empty-state">Unable to load loans. Please try again.</td></tr>';
  }
}
