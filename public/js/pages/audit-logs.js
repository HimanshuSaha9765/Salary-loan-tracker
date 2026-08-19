import {
  apiCall,
  debounce,
  escapeHTML,
  formatDateTime,
  formatINR,
  requireAdmin,
} from "../app.js";
import { initNav } from "../nav.js";
import { showToast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";

const user = await requireAdmin();
let currentPage = 1;
let selectedLogIds = new Set();
let currentLogs = [];

if (user) {
  initNav("audit-logs");
  await loadDropdowns().catch(() => {});
  bindFilters();
  bindSelectionActions();
  loadLogs(1);
}

function normalizeInputDate(val) {
  if (!val) return "";
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/.exec(trimmed);
  if (match) {
    const d = match[1].padStart(2, "0");
    const m = match[2].padStart(2, "0");
    let y = match[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m}-${d}`;
  }
  return "";
}

async function loadDropdowns() {
  const employees = await apiCall("/api/employees?limit=100&status=active").catch(() => ({ employees: [] }));
  const empSelect = document.getElementById("employee-filter");
  if (empSelect && employees.employees) {
    empSelect.innerHTML =
      '<option value="">All employees</option>' +
      employees.employees
        .map(
          (item) =>
            `<option value="${item.id}">${escapeHTML(item.full_name)} · ${item.emp_code}</option>`,
        )
        .join("");
  }

  const managers = await apiCall("/api/managers").catch(() => ({ managers: [] }));
  const mgrSelect = document.getElementById("manager-filter");
  if (mgrSelect && managers.managers) {
    mgrSelect.innerHTML =
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
  const triggerReload = () => {
    currentPage = 1;
    loadLogs(1);
  };

  document
    .querySelectorAll(".filter-bar select")
    .forEach((el) => el.addEventListener("change", triggerReload));

  document
    .querySelectorAll(".filter-bar input")
    .forEach((el) => {
      el.addEventListener("change", triggerReload);
      el.addEventListener("input", debounce(triggerReload, 350));
    });

  document
    .getElementById("date-filter")
    ?.addEventListener("change", toggleCustomDates);

  // Auto-slash date typing for from-date and to-date
  ["from-date", "to-date"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "");
      if (val.length > 8) val = val.slice(0, 8);
      let formatted = "";
      if (val.length > 0) formatted += val.slice(0, 2);
      if (val.length >= 3) formatted += "/" + val.slice(2, 4);
      if (val.length >= 5) formatted += "/" + val.slice(4, 8);
      e.target.value = formatted;
    });
  });

  document.getElementById("clear-filters")?.addEventListener("click", () => {
    document
      .querySelectorAll(".filter-bar select")
      .forEach((el) => (el.selectedIndex = 0));
    document
      .querySelectorAll(".filter-bar input")
      .forEach((el) => (el.value = ""));
    toggleCustomDates();
    triggerReload();
  });
}

function toggleCustomDates() {
  const isCustom = document.getElementById("date-filter")?.value === "custom";
  document.getElementById("from-date-wrap")?.classList.toggle("hidden", !isCustom);
  document.getElementById("to-date-wrap")?.classList.toggle("hidden", !isCustom);
}

function queryString(page = 1) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", "25");

  const get = (id) => document.getElementById(id)?.value?.trim() || "";

  if (get("employee-filter")) params.set("employeeId", get("employee-filter"));
  if (get("manager-filter")) params.set("managerId", get("manager-filter"));
  if (get("action-filter")) params.set("actionType", get("action-filter"));

  const dateFilter = get("date-filter");
  if (dateFilter && dateFilter !== "custom") {
    params.set("days", dateFilter);
  } else if (dateFilter === "custom") {
    const fromIso = normalizeInputDate(get("from-date"));
    const toIso = normalizeInputDate(get("to-date"));
    if (fromIso) params.set("fromDate", fromIso);
    if (toIso) params.set("toDate", toIso);
  }

  return params.toString();
}

function formatActionBadge(action) {
  const raw = String(action || "").toUpperCase();
  let badgeClass = "badge-primary";
  let label = raw.replace(/_/g, " ");

  if (raw.includes("DELETE")) {
    badgeClass = "badge-danger";
  } else if (raw.includes("CREATE")) {
    badgeClass = "badge-success";
  } else if (raw.includes("LOGIN") || raw.includes("AUTH")) {
    badgeClass = "badge-info";
  } else if (raw.includes("UPDATE") || raw.includes("RESET")) {
    badgeClass = "badge-warning";
  }

  return `<span class="badge ${badgeClass}">${escapeHTML(label)}</span>`;
}

async function loadLogs(page = 1) {
  currentPage = page;
  const body = document.getElementById("audit-body");

  body.innerHTML = `
    <tr class="skeleton-row"><td colspan="7"><span class="skeleton"></span></td></tr>
    <tr class="skeleton-row"><td colspan="7"><span class="skeleton"></span></td></tr>
    <tr class="skeleton-row"><td colspan="7"><span class="skeleton"></span></td></tr>
  `;

  try {
    const data = await apiCall(`/api/audit-logs?${queryString(page)}`);
    currentLogs = data.logs || [];

    if (!currentLogs.length) {
      body.innerHTML = `<tr><td colspan="7" class="empty-state">No audit activity matches the selected filters.</td></tr>`;
      renderPagination(data.pagination);
      updateSelectionBar();
      return;
    }

    body.innerHTML = currentLogs
      .map((log) => {
        const isChecked = selectedLogIds.has(Number(log.id));
        return `
          <tr>
            <td class="admin-only checkbox-col"><input type="checkbox" class="log-checkbox" data-id="${log.id}" ${isChecked ? "checked" : ""}></td>
            <td>${formatDateTime(log.created_at)}</td>
            <td>
              <strong>${escapeHTML(log.user_name || "System")}</strong>
              <span class="cell-meta">${escapeHTML(log.user_role || "")}</span>
            </td>
            <td>${formatActionBadge(log.action_type)}</td>
            <td>
              ${log.employee_name ? `<strong>${escapeHTML(log.employee_name)}</strong><span class="cell-meta">${escapeHTML(log.emp_code || "")}</span>` : "—"}
            </td>
            <td class="amount">${log.amount ? formatINR(log.amount) : "—"}</td>
            <td>${escapeHTML(log.description || "—")}</td>
          </tr>
        `;
      })
      .join("");

    bindCheckboxEvents();
    renderPagination(data.pagination);
    updateSelectionBar();
  } catch (error) {
    body.innerHTML = `<tr><td colspan="7" class="empty-state">Unable to load audit logs. Please try again.</td></tr>`;
    showToast("Audit logs could not be loaded. Please try again.", "error");
  }
}

function bindCheckboxEvents() {
  const selectAllBox = document.getElementById("select-all");
  const checkboxes = document.querySelectorAll(".log-checkbox");

  checkboxes.forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const id = Number(e.target.dataset.id);
      if (e.target.checked) {
        selectedLogIds.add(id);
      } else {
        selectedLogIds.delete(id);
      }
      updateSelectAllHeader();
      updateSelectionBar();
    });
  });

  if (selectAllBox) {
    selectAllBox.checked =
      currentLogs.length > 0 &&
      currentLogs.every((log) => selectedLogIds.has(Number(log.id)));
    selectAllBox.indeterminate =
      currentLogs.some((log) => selectedLogIds.has(Number(log.id))) &&
      !selectAllBox.checked;

    selectAllBox.onclick = (e) => {
      const checked = e.target.checked;
      currentLogs.forEach((log) => {
        const id = Number(log.id);
        if (checked) selectedLogIds.add(id);
        else selectedLogIds.delete(id);
      });
      document.querySelectorAll(".log-checkbox").forEach((cb) => (cb.checked = checked));
      updateSelectionBar();
    };
  }
}

function updateSelectAllHeader() {
  const selectAllBox = document.getElementById("select-all");
  if (!selectAllBox) return;
  const pageIds = currentLogs.map((l) => Number(l.id));
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedLogIds.has(id));
  const someSelected = pageIds.some((id) => selectedLogIds.has(id));

  selectAllBox.checked = allSelected;
  selectAllBox.indeterminate = someSelected && !allSelected;
}

function updateSelectionBar() {
  const bar = document.getElementById("selection-bar");
  const countEl = document.getElementById("selected-count");
  if (!bar || !countEl) return;

  const count = selectedLogIds.size;
  countEl.textContent = String(count);

  if (count > 0) {
    bar.classList.remove("hidden");
  } else {
    bar.classList.add("hidden");
  }
}

function bindSelectionActions() {
  document.getElementById("btn-deselect-all")?.addEventListener("click", () => {
    selectedLogIds.clear();
    document.querySelectorAll(".log-checkbox").forEach((cb) => (cb.checked = false));
    updateSelectAllHeader();
    updateSelectionBar();
  });

  document.getElementById("btn-bulk-delete")?.addEventListener("click", () => {
    if (selectedLogIds.size === 0) return;
    openBulkDeleteModal();
  });
}

function openBulkDeleteModal() {
  const count = selectedLogIds.size;
  const modal = openModal(`
    <div class="modal-header">
      <div>
        <h2 class="modal-title">Delete ${count} Audit ${count === 1 ? "Record" : "Records"}</h2>
        <p class="modal-subtitle">Permanently delete selected system audit logs</p>
      </div>
      <button class="icon-button" id="modal-close" type="button" aria-label="Close dialog">×</button>
    </div>
    <div class="delete-content">
      <div class="delete-warning">
        <p>⚠️ <strong>Permanent Action Warning</strong></p>
        <p style="margin-top:6px;font-size:13px;color:var(--text-muted)">
          You are about to permanently delete <strong>${count} audit log ${count === 1 ? "entry" : "entries"}</strong>. This action cannot be reversed and logs will be permanently removed from audit history.
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" type="button" id="cancel-bulk-delete">Cancel</button>
        <button class="btn btn-danger" type="button" id="confirm-bulk-delete">Yes, Delete ${count} Logs</button>
      </div>
    </div>
  `);

  document.getElementById("cancel-bulk-delete")?.addEventListener("click", closeModal);
  document.getElementById("modal-close")?.addEventListener("click", closeModal);

  document.getElementById("confirm-bulk-delete")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Deleting…";

    try {
      const ids = Array.from(selectedLogIds);
      await apiCall("/api/audit-logs", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });

      closeModal();
      showToast(`Successfully deleted ${ids.length} audit records.`, "success");
      selectedLogIds.clear();
      updateSelectionBar();
      loadLogs(currentPage);
    } catch (err) {
      showToast(err.message || "Failed to delete audit logs.", "error");
      btn.disabled = false;
      btn.textContent = `Yes, Delete ${count} Logs`;
    }
  });
}

function renderPagination(pagination) {
  const container = document.getElementById("pagination");
  if (!container || !pagination) return;

  const { page, pages, total } = pagination;
  if (pages <= 1 && total <= 25) {
    container.innerHTML = `<div class="pagination-info">Showing all ${total} audit records</div>`;
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
      <div class="pagination-info">Page ${page} of ${pages} (${total} total records)</div>
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
        loadLogs(targetPage);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
}
