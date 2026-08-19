import {
  apiCall,
  debounce,
  escapeHTML,
  formatINR,
  requireAuth,
} from "../app.js";
import { initNav } from "../nav.js";
import { showToast } from "../toast.js";

const user = await requireAuth();
let currentPage = 1;

if (user) {
  initNav("employees");

  if (user.role !== "admin") {
    document.querySelectorAll(".manager-only").forEach((el) => el.remove());
  } else {
    loadManagersDropdown();
  }

  bindEvents();
  loadEmployees(1);
}

async function loadManagersDropdown() {
  try {
    const data = await apiCall("/api/managers");
    const select = document.getElementById("manager-filter");
    if (select && data.managers) {
      select.innerHTML =
        '<option value="">All managers</option>' +
        data.managers
          .map(
            (m) =>
              `<option value="${m.id}">${escapeHTML(m.full_name)}</option>`,
          )
          .join("");
    }
  } catch {}
}

function bindEvents() {
  document
    .getElementById("employee-search")
    ?.addEventListener("input", debounce(() => loadEmployees(1)));

  document
    .getElementById("status-filter")
    ?.addEventListener("change", () => loadEmployees(1));

  document
    .getElementById("sort-filter")
    ?.addEventListener("change", () => loadEmployees(1));

  document
    .getElementById("manager-filter")
    ?.addEventListener("change", () => loadEmployees(1));
}

function queryString(page = 1) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", "20");

  const search = document.getElementById("employee-search")?.value?.trim();
  const status = document.getElementById("status-filter")?.value;
  const sort = document.getElementById("sort-filter")?.value;
  const manager = document.getElementById("manager-filter")?.value;

  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (sort) params.set("sort", sort);
  if (user.role === "admin" && manager) params.set("managerId", manager);

  return params.toString();
}

async function loadEmployees(page = 1) {
  currentPage = page;
  const tableBody = document.getElementById("employees-body");
  const cardsContainer = document.getElementById("employees-cards");

  if (tableBody) {
    tableBody.innerHTML = `
      <tr class="skeleton-row"><td colspan="6"><span class="skeleton"></span></td></tr>
      <tr class="skeleton-row"><td colspan="6"><span class="skeleton"></span></td></tr>
      <tr class="skeleton-row"><td colspan="6"><span class="skeleton"></span></td></tr>
    `;
  }

  if (cardsContainer) {
    cardsContainer.innerHTML = `
      <div class="card skeleton-card"><span class="skeleton" style="height:80px"></span></div>
      <div class="card skeleton-card"><span class="skeleton" style="height:80px"></span></div>
    `;
  }

  try {
    const data = await apiCall(`/api/employees?${queryString(page)}`);
    const employees = data.employees || [];

    if (!employees.length) {
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="6" class="empty-state">No employees match the selected criteria.</td></tr>`;
      }
      if (cardsContainer) {
        cardsContainer.innerHTML = `<div class="empty-state" style="padding:24px">No employees match the selected criteria.</div>`;
      }
      renderPagination(data.pagination);
      return;
    }

    // Render Table View
    if (tableBody) {
      tableBody.innerHTML = employees
        .map((emp) => {
          const outstanding = Number(emp.outstanding) || 0;
          return `
            <tr class="row-clickable" onclick="location.href='/employee-detail?id=${emp.id}'">
              <td>
                <strong>${escapeHTML(emp.full_name)}</strong>
                <span class="cell-meta">${escapeHTML(emp.emp_code)}</span>
              </td>
              <td>${escapeHTML(emp.phone || "—")}</td>
              <td>${escapeHTML(emp.manager_name || "Unassigned")}</td>
              <td class="amount-col">
                <span class="${outstanding > 0 ? "text-danger font-bold" : "text-secondary"}">
                  ${formatINR(outstanding)}
                </span>
              </td>
              <td>
                <span class="badge ${emp.is_active ? "badge-success" : "badge-neutral"}">
                  ${emp.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td style="text-align: right;">
                <a class="btn btn-sm btn-secondary" href="/employee-detail?id=${emp.id}" onclick="event.stopPropagation()">View</a>
              </td>
            </tr>
          `;
        })
        .join("");
    }

    // Render Mobile Cards View
    if (cardsContainer) {
      cardsContainer.innerHTML = employees
        .map((emp) => {
          const outstanding = Number(emp.outstanding) || 0;
          return `
            <div class="employee-mobile-card" onclick="location.href='/employee-detail?id=${emp.id}'">
              <div class="emp-card-header">
                <div>
                  <h3 class="emp-card-name">${escapeHTML(emp.full_name)}</h3>
                  <span class="cell-meta">${escapeHTML(emp.emp_code)} · ${escapeHTML(emp.phone || "No phone")}</span>
                </div>
                <span class="badge ${emp.is_active ? "badge-success" : "badge-neutral"}">
                  ${emp.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <div class="emp-card-body">
                <div class="emp-card-meta-item">
                  <span class="emp-meta-label">Manager</span>
                  <span class="emp-meta-val">${escapeHTML(emp.manager_name || "Unassigned")}</span>
                </div>
                <div class="emp-card-meta-item" style="text-align: right;">
                  <span class="emp-meta-label">Loan Balance</span>
                  <span class="emp-meta-val ${outstanding > 0 ? "text-danger font-bold" : "text-secondary"}">
                    ${formatINR(outstanding)}
                  </span>
                </div>
              </div>
              <div class="emp-card-footer">
                <a class="btn btn-sm btn-secondary full-width" href="/employee-detail?id=${emp.id}" onclick="event.stopPropagation()">
                  View Full Profile →
                </a>
              </div>
            </div>
          `;
        })
        .join("");
    }

    renderPagination(data.pagination);
  } catch (error) {
    const errorHtml = `
      <div class="empty-state" style="padding:28px">
        <p style="color:var(--danger);font-weight:600;margin-bottom:8px">Unable to load employees.</p>
        <button class="btn btn-secondary btn-sm" id="btn-retry-employees">Try Again</button>
      </div>
    `;

    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="6">${errorHtml}</td></tr>`;
    }
    if (cardsContainer) {
      cardsContainer.innerHTML = errorHtml;
    }

    document.getElementById("btn-retry-employees")?.addEventListener("click", () => loadEmployees(currentPage));
    showToast("Employee records could not be loaded. Please try again.", "error");
  }
}

function renderPagination(pagination) {
  const container = document.getElementById("pagination");
  if (!container || !pagination) return;

  const { page, pages, total } = pagination;
  if (pages <= 1 && total <= 20) {
    container.innerHTML = `<div class="pagination-info">Showing all ${total} employees</div>`;
    return;
  }

  let pagesHtml = "";
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(pages, page + 2);

  for (let i = startPage; i <= endPage; i++) {
    pagesHtml += `<button class="pagination-btn ${i === page ? "active" : ""}" data-page="${i}">${i}</button>`;
  }

  container.innerHTML = `
    <div class="pagination-container">
      <div class="pagination-info">Page ${page} of ${pages} (${total} total employees)</div>
      <div class="pagination-controls">
        <button class="pagination-btn" ${page <= 1 ? "disabled" : ""} data-page="${page - 1}">Previous</button>
        ${pagesHtml}
        <button class="pagination-btn" ${page >= pages ? "disabled" : ""} data-page="${page + 1}">Next</button>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetPage = Number(btn.dataset.page);
      if (targetPage && targetPage !== page) {
        loadEmployees(targetPage);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
}
