import {
  apiCall,
  escapeHTML,
  formatDate,
  formatINR,
  getTodayDate,
  requireAuth,
} from "../app.js";
import { initNav } from "../nav.js";
import { exportEntriesReport } from "../pdf.js";
import { showToast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";

const user = await requireAuth();
let allEntries = [];

if (user) {
  initNav("entries");

  if (user.role !== "admin") {
    document.querySelectorAll(".manager-only").forEach((el) => el.remove());
    document.querySelector(".data-table thead tr th:last-child")?.remove();
  }

  await loadDropdowns().catch(() => {});
  bindFilters();
  loadEntries();
}

async function loadDropdowns() {
  const employees = await apiCall("/api/employees?limit=30&status=active");
  document.getElementById("employee-filter").innerHTML =
    '<option value="">All employees</option>' +
    employees.employees
      .map(
        (item) =>
          `<option value="${item.id}">${escapeHTML(item.full_name)} · ${item.emp_code}</option>`,
      )
      .join("");
  if (user.role === "admin") {
    const managers = await apiCall("/api/managers");
    document.getElementById("manager-filter").innerHTML =
      '<option value="">All managers</option>' +
      managers.managers
        .map(
          (item) =>
            `<option value="${item.id}">${escapeHTML(item.full_name)}</option>`,
        )
        .join("");
  }
}
function bindFilters() {
  document
    .querySelectorAll(".filter-bar select,.filter-bar input")
    .forEach((element) => element.addEventListener("change", loadEntries));
  document
    .getElementById("date-filter")
    .addEventListener("change", toggleCustomDates);
  document
    .getElementById("amount-filter")
    .addEventListener("change", toggleCustomAmounts);
  document.getElementById("clear-filters").addEventListener("click", () => {
    document
      .querySelectorAll(".filter-bar select")
      .forEach((element) => (element.selectedIndex = 0));
    document
      .querySelectorAll(".filter-bar input")
      .forEach((element) => (element.value = ""));
    toggleCustomDates();
    toggleCustomAmounts();
    loadEntries();
  });
  document.getElementById("export-entries").addEventListener("click", () => {
    try {
      exportEntriesReport(allEntries);
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}
function toggleCustomDates() {
  const visible = document.getElementById("date-filter").value === "custom";
  document
    .getElementById("from-date-wrap")
    .classList.toggle("hidden", !visible);
  document.getElementById("to-date-wrap").classList.toggle("hidden", !visible);
}
function toggleCustomAmounts() {
  const visible = document.getElementById("amount-filter").value === "custom";
  document
    .getElementById("min-amount-wrap")
    .classList.toggle("hidden", !visible);
  document
    .getElementById("max-amount-wrap")
    .classList.toggle("hidden", !visible);
}
function toISODate(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/.exec(trimmed);
  if (!match) return "";
  let [, day, month, year] = match;
  if (year.length === 2) year = `20${year}`;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
function queryString() {
  const params = new URLSearchParams();
  const get = (id) => document.getElementById(id)?.value || "";
  if (get("employee-filter")) params.set("employeeId", get("employee-filter"));
  if (get("manager-filter")) params.set("managerId", get("manager-filter"));
  if (get("type-filter")) params.set("type", get("type-filter"));
  const days = get("date-filter");
  if (days && days !== "custom") {
    const date = new Date();
    date.setDate(date.getDate() - Number(days));
    params.set("fromDate", date.toISOString().slice(0, 10));
    params.set("toDate", getTodayDate());
  }
  if (days === "custom") {
    if (toISODate(get("from-date")))
      params.set("fromDate", toISODate(get("from-date")));
    if (toISODate(get("to-date")))
      params.set("toDate", toISODate(get("to-date")));
  }
  const amount = get("amount-filter");
  if (amount && amount !== "custom") {
    const [min, max] = amount.split("-");
    if (min) params.set("minAmount", min);
    if (max) params.set("maxAmount", max);
  }
  if (amount === "custom") {
    if (get("min-amount")) params.set("minAmount", get("min-amount"));
    if (get("max-amount")) params.set("maxAmount", get("max-amount"));
  }
  return params.toString();
}
async function loadEntries() {
  const body = document.getElementById("entries-body");
  const colSpan = user.role === "admin" ? 7 : 6;
  body.innerHTML =
    `<tr class="skeleton-row"><td colspan="${colSpan}"><span class="skeleton"></span></td></tr><tr class="skeleton-row"><td colspan="${colSpan}"><span class="skeleton"></span></td></tr>`;
  try {
    const data = await apiCall(`/api/entries?${queryString()}`);
    allEntries = data.entries;
    body.innerHTML =
      data.entries
        .map(
          (entry) =>
            `<tr><td>${formatDate(entry.entry_date)}</td><td><strong>${escapeHTML(entry.employee_name)}</strong><span class="cell-meta">${entry.emp_code}</span></td><td>${escapeHTML(entry.manager_name || "Unassigned")}</td><td><span class="badge badge-primary">${escapeHTML(entry.entry_type.replace("_", " "))}</span></td><td>${formatINR(entry.amount)}</td><td>${escapeHTML(entry.remarks || "—")}</td>${user.role === "admin" ? `<td><button class="btn btn-sm btn-danger" data-delete="${entry.id}">Delete</button></td>` : ""}</tr>`,
        )
        .join("") ||
      `<tr><td colspan="${colSpan}" class="empty-state">No entries match the selected filters.</td></tr>`;
    if (user.role === "admin") {
      body
        .querySelectorAll("[data-delete]")
        .forEach((button) =>
          button.addEventListener("click", () =>
            openDeleteDialog(button.dataset.delete),
          ),
        );
    }
  } catch (error) {
    body.innerHTML =
      `<tr><td colspan="${colSpan}" class="empty-state">Unable to load entries. Please try again.</td></tr>`;
    showToast("Entries could not be loaded. Please try again.", "error");
  }
}
function openDeleteDialog(id) {
  const modal = openModal(
    `<div class="modal-header">
      <div>
        <h2 class="modal-title">Delete Entry #${id}</h2>
        <p class="modal-subtitle">Reversible financial record deletion</p>
      </div>
      <button class="icon-button" id="close-delete" aria-label="Close">×</button>
    </div>
    <div class="delete-content">
      <div class="danger-notice">
        <strong>Important</strong>
        <span>Deleting this transaction reverses any repayment allocations and restores previous loan balances immediately.</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="delete-reason">Reason for deletion</label>
        <textarea class="textarea" id="delete-reason" placeholder="Explain why this entry is being removed..." rows="2" style="min-height:70px;resize:none" required></textarea>
      </div>
      <div class="form-group">
        <label class="form-label" for="delete-confirm">Authorization</label>
        <input class="input" id="delete-confirm" autocomplete="off" placeholder="Type CONFIRM to authorize">
        <span class="form-hint">Type CONFIRM in capital letters to activate the delete button.</span>
      </div>
    </div>
    <div class="modal-footer" style="padding:14px 24px;margin:0;background:var(--surface-hover);border-top:1px solid var(--border)">
      <button class="btn btn-secondary" id="cancel-delete">Cancel</button>
      <button class="btn btn-danger" id="confirm-delete" disabled>Delete Entry</button>
    </div>`,
  );
  const input = modal.querySelector("#delete-confirm");
  const action = modal.querySelector("#confirm-delete");
  input.addEventListener(
    "input",
    () => (action.disabled = input.value !== "CONFIRM"),
  );
  modal.querySelector("#close-delete").addEventListener("click", closeModal);
  modal.querySelector("#cancel-delete").addEventListener("click", closeModal);
  action.addEventListener("click", async () => {
    const reason = modal.querySelector("#delete-reason").value.trim();
    if (!reason) {
      showToast("Please enter a reason for deleting this entry.", "error");
      return;
    }
    action.disabled = true;
    action.textContent = "Deleting…";
    try {
      await apiCall(`/api/entries?id=${id}`, {
        method: "DELETE",
        body: JSON.stringify({ reason, confirmation: "CONFIRM" }),
      });
      closeModal();
      showToast(
        "Entry deleted and related balances updated successfully.",
        "success",
      );
      loadEntries();
    } catch (error) {
      showToast(error.message, "error");
      action.disabled = false;
      action.textContent = "Delete Entry";
    }
  });
}
