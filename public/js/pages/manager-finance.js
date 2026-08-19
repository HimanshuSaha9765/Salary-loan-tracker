import {
  apiCall,
  debounce,
  escapeHTML,
  formatDate,
  formatDateTime,
  formatINR,
  formatShortDateIST,
  requireAdmin,
} from "../app.js";
import { initNav } from "../nav.js";
import { showToast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";

const user = await requireAdmin();
let currentTab = "dashboard";
let cachedManagers = [];

if (user) {
  initNav("manager-finance");
  setupTabs();
  switchTab("dashboard");
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      if (target) switchTab(target);
    });
  });
}

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  const content = document.getElementById("manager-finance-content");
  content.innerHTML = '<span class="skeleton" style="height: 160px; display: block; border-radius: 8px;"></span>';

  if (tabName === "dashboard") renderDashboardTab();
  else if (tabName === "add-entry") renderAddEntryTab();
  else if (tabName === "all-entries") renderAllEntriesTab();
  else if (tabName === "loans-overview") renderLoansOverviewTab();
  else if (tabName === "audit-logs") renderAuditLogsTab();
}

function toISODate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/.exec(trimmed);
  if (match) {
    const d = match[1].padStart(2, "0");
    const m = match[2].padStart(2, "0");
    let y = match[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m}-${d}`;
  }
  return null;
}

function toDisplayDate(isoValue) {
  if (!isoValue) return "";
  const parts = String(isoValue).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoValue;
}

// ============================================================================
// TAB 1: DASHBOARD
// ============================================================================
async function renderDashboardTab() {
  const container = document.getElementById("manager-finance-content");
  try {
    const data = await apiCall("/api/manager-finance?tab=dashboard");
    cachedManagers = data.managers || [];
    const k = data.kpis || {};

    container.innerHTML = `
      <section class="grid grid-4" style="margin-bottom: 24px;">
        <div class="card kpi-card danger">
          <span class="kpi-label">This Month Loans Given</span>
          <span class="kpi-value">${formatINR(k.this_month_loans)}</span>
        </div>
        <div class="card kpi-card success">
          <span class="kpi-label">This Month Repayments</span>
          <span class="kpi-value">${formatINR(k.this_month_repayments)}</span>
        </div>
        <div class="card kpi-card primary">
          <span class="kpi-label">This Month Salary Given</span>
          <span class="kpi-value">${formatINR(k.this_month_salary)}</span>
        </div>
        <div class="card kpi-card danger">
          <span class="kpi-label">Total Outstanding Balance</span>
          <span class="kpi-value">${formatINR(k.total_outstanding)}</span>
        </div>
      </section>

      <div class="grid grid-2" style="gap: 20px;">
        <section class="card table-card" style="margin: 0;">
          <div class="card-header" style="padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <h2 style="font-size: 15px; font-weight: 700; margin: 0;">Top Outstanding Managers</h2>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Manager</th>
                  <th class="amount-col">Total Loans</th>
                  <th class="amount-col">Repaid</th>
                  <th class="amount-col">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                ${
                  data.topManagers?.length
                    ? data.topManagers
                        .map(
                          (m) => `
                        <tr>
                          <td><strong>${escapeHTML(m.manager_name)}</strong><span class="cell-meta">${escapeHTML(m.phone || "—")}</span></td>
                          <td class="amount-col">${formatINR(m.total_loan)}</td>
                          <td class="amount-col text-success">${formatINR(m.total_repaid)}</td>
                          <td class="amount-col text-danger font-bold">${formatINR(m.total_outstanding)}</td>
                        </tr>
                      `,
                        )
                        .join("")
                    : '<tr><td colspan="4" class="empty-state">No outstanding manager loans.</td></tr>'
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="card table-card" style="margin: 0;">
          <div class="card-header" style="padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <h2 style="font-size: 15px; font-weight: 700; margin: 0;">Recent Manager Activity</h2>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Manager</th>
                  <th>Type</th>
                  <th class="amount-col">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${
                  data.recentActivity?.length
                    ? data.recentActivity
                        .map((entry) => {
                          const typeClass =
                            entry.entry_type === "salary_given"
                              ? "badge-primary"
                              : entry.entry_type === "loan_given"
                                ? "badge-danger"
                                : "badge-success";
                          const typeText = entry.entry_type.replace("_", " ");
                          return `
                        <tr>
                          <td>${formatDate(entry.entry_date)}</td>
                          <td><strong>${escapeHTML(entry.manager_name)}</strong></td>
                          <td><span class="badge ${typeClass}">${escapeHTML(typeText)}</span></td>
                          <td class="amount-col">${formatINR(entry.amount)}</td>
                        </tr>
                      `;
                        })
                        .join("")
                    : '<tr><td colspan="4" class="empty-state">No recent activity.</td></tr>'
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Unable to load dashboard data. <br><button class="btn btn-secondary btn-sm" onclick="location.reload()" style="margin-top:8px">Retry</button></div>`;
    showToast(err.message, "error");
  }
}

// ============================================================================
// TAB 2: ADD ENTRY
// ============================================================================
async function renderAddEntryTab() {
  const container = document.getElementById("manager-finance-content");
  let entryType = "salary_given";
  let activeLoans = [];

  const managersData = await apiCall("/api/manager-finance?tab=dashboard").catch(() => ({ managers: [] }));
  const managers = managersData.managers || [];
  cachedManagers = managers;

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayDisplay = toDisplayDate(todayIso);

  container.innerHTML = `
    <div style="max-width: 680px; margin: 0 auto;">
      <h2 style="font-size: 17px; font-weight: 700; margin: 0 0 16px;">New Manager Financial Entry</h2>
      <form id="mf-entry-form" class="form-grid">
        <div class="form-group full-width">
          <label class="form-label" for="mf-entry-manager">Select Manager</label>
          <select class="select" id="mf-entry-manager" required>
            <option value="">Select a manager</option>
            ${managers.map((m) => `<option value="${m.id}">${escapeHTML(m.full_name)}</option>`).join("")}
          </select>
        </div>

        <div class="form-group full-width">
          <label class="form-label">Transaction Type</label>
          <div class="grid grid-3" style="gap: 8px;">
            <button class="btn btn-primary mf-type-btn" type="button" data-type="salary_given">Salary Given</button>
            <button class="btn btn-secondary mf-type-btn" type="button" data-type="loan_given">Loan Given</button>
            <button class="btn btn-secondary mf-type-btn" type="button" data-type="repayment">Repayment</button>
          </div>
        </div>

        <div class="form-group full-width" id="mf-repayment-mode-wrap" style="display: none;">
          <label class="form-label" for="mf-repayment-mode">Repayment Mode</label>
          <select class="select" id="mf-repayment-mode">
            <option value="fifo">FIFO (Automatic)</option>
            <option value="specific">Specific Loan</option>
          </select>
        </div>

        <div class="form-group full-width" id="mf-specific-loan-wrap" style="display: none;">
          <label class="form-label" for="mf-specific-loan">Target Active Loan</label>
          <select class="select" id="mf-specific-loan">
            <option value="">Select active loan</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="mf-entry-date">Entry Date</label>
          <div class="date-picker-wrap">
            <input class="input" id="mf-entry-date" inputmode="numeric" placeholder="DD/MM/YYYY" maxlength="10" value="${todayDisplay}" required>
            <button type="button" class="date-picker-btn" id="mf-date-btn" title="Open Calendar">📅</button>
            <input type="date" class="date-picker-hidden" id="mf-date-hidden" value="${todayIso}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="mf-entry-amount">Amount (₹)</label>
          <input class="input" id="mf-entry-amount" type="number" step="0.01" min="0.01" placeholder="Enter amount" required>
        </div>

        <div class="form-group full-width">
          <label class="form-label" for="mf-entry-remarks">Remarks (Optional)</label>
          <textarea class="textarea" id="mf-entry-remarks" placeholder="Add any notes or context…"></textarea>
        </div>

        <div class="form-group full-width">
          <button class="btn btn-primary full-width" type="submit" id="btn-save-mf-entry">Save Manager Entry</button>
        </div>
      </form>
    </div>
  `;

  // Wire Date Picker
  const visibleInput = document.getElementById("mf-entry-date");
  const hiddenInput = document.getElementById("mf-date-hidden");
  const calBtn = document.getElementById("mf-date-btn");

  calBtn.addEventListener("click", () => {
    if (typeof hiddenInput.showPicker === "function") hiddenInput.showPicker();
    else hiddenInput.focus();
  });
  hiddenInput.addEventListener("change", () => {
    if (hiddenInput.value) visibleInput.value = toDisplayDate(hiddenInput.value);
  });
  visibleInput.addEventListener("input", (e) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 8) val = val.slice(0, 8);
    let formatted = "";
    if (val.length > 0) formatted += val.slice(0, 2);
    if (val.length >= 3) formatted += "/" + val.slice(2, 4);
    if (val.length >= 5) formatted += "/" + val.slice(4, 8);
    e.target.value = formatted;
    const iso = toISODate(formatted);
    if (iso) hiddenInput.value = iso;
  });

  // Type Buttons
  async function selectType(t) {
    entryType = t;
    document.querySelectorAll(".mf-type-btn").forEach((btn) => {
      const match = btn.dataset.type === t;
      btn.classList.toggle("btn-primary", match);
      btn.classList.toggle("btn-secondary", !match);
    });
    const isRepay = t === "repayment";
    document.getElementById("mf-repayment-mode-wrap").style.display = isRepay ? "block" : "none";
    updateSpecificLoanVisibility();
    if (isRepay) {
      await loadManagerLoans();
    }
  }

  document.querySelectorAll(".mf-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectType(btn.dataset.type));
  });

  async function loadManagerLoans() {
    const mgrId = document.getElementById("mf-entry-manager")?.value;
    if (!mgrId) {
      activeLoans = [];
      updateSpecificLoanOptions();
      return;
    }
    try {
      const res = await apiCall(`/api/manager-finance?tab=loans&managerId=${mgrId}&status=active`);
      activeLoans = res.loans || [];
      updateSpecificLoanOptions();
    } catch {
      activeLoans = [];
    }
  }

  function updateSpecificLoanOptions() {
    const select = document.getElementById("mf-specific-loan");
    if (!select) return;
    if (!activeLoans.length) {
      select.innerHTML = '<option value="">No active loans found</option>';
      return;
    }
    select.innerHTML =
      '<option value="">Select active loan</option>' +
      activeLoans
        .map(
          (l) =>
            `<option value="${l.id}">${l.loan_type === "pre_system" ? "Before System" : "Regular"} · ${formatShortDateIST(l.loan_date || l.created_at)} · ${formatINR(l.remaining_amount)} remaining</option>`,
        )
        .join("");

    if (activeLoans.length > 0) {
      select.value = String(activeLoans[0].id);
    }
  }

  function updateSpecificLoanVisibility() {
    const isRepay = entryType === "repayment";
    const isSpecific = document.getElementById("mf-repayment-mode")?.value === "specific";
    document.getElementById("mf-specific-loan-wrap").style.display = isRepay && isSpecific ? "block" : "none";
  }

  document.getElementById("mf-entry-manager").addEventListener("change", loadManagerLoans);
  document.getElementById("mf-repayment-mode").addEventListener("change", () => {
    updateSpecificLoanVisibility();
    if (entryType === "repayment") loadManagerLoans();
  });

  if (managers.length === 1) {
    const mgrSelect = document.getElementById("mf-entry-manager");
    if (mgrSelect) {
      mgrSelect.value = String(managers[0].id);
      loadManagerLoans();
    }
  }

  // Form Submit
  document.getElementById("mf-entry-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-save-mf-entry");
    const mgrId = document.getElementById("mf-entry-manager").value;
    const rawDate = visibleInput.value || hiddenInput.value;
    const isoDate = toISODate(rawDate) || hiddenInput.value || new Date().toISOString().slice(0, 10);
    const amountVal = Number(document.getElementById("mf-entry-amount").value);
    const remarks = document.getElementById("mf-entry-remarks").value;
    const repaymentMode = document.getElementById("mf-repayment-mode").value || "fifo";
    const specificLoanId = document.getElementById("mf-specific-loan")?.value || null;

    if (!mgrId) return showToast("Please select a manager.", "error");
    if (!isoDate) return showToast("Please enter a valid date in DD/MM/YYYY.", "error");
    if (!amountVal || amountVal <= 0) return showToast("Please enter a valid positive amount.", "error");

    if (entryType === "repayment") {
      try {
        const res = await apiCall(`/api/manager-finance?tab=loans&managerId=${mgrId}&status=active`);
        activeLoans = res.loans || [];
      } catch {}

      const totalRemaining = activeLoans.reduce((s, l) => s + Number(l.remaining_amount || 0), 0);
      if (activeLoans.length === 0 || totalRemaining <= 0) {
        return showToast("No active loan balance exists for this manager.", "error");
      }
      if (amountVal > totalRemaining) {
        return showToast(`Repayment amount (${formatINR(amountVal)}) exceeds total outstanding manager loan balance (${formatINR(totalRemaining)}).`, "error");
      }
      if (repaymentMode === "specific" && !specificLoanId) {
        return showToast("Please select a specific active loan for repayment.", "error");
      }
    }

    btn.disabled = true;
    btn.textContent = "Saving entry…";

    try {
      await apiCall("/api/manager-finance?tab=entries", {
        method: "POST",
        body: JSON.stringify({
          managerId: mgrId,
          entryDate: isoDate,
          entryType,
          amount: amountVal,
          repaymentMode: entryType === "repayment" ? repaymentMode : null,
          specificLoanId: entryType === "repayment" && repaymentMode === "specific" ? specificLoanId : null,
          remarks,
        }),
      });

      showToast("Manager financial entry recorded successfully.", "success");
      document.getElementById("mf-entry-amount").value = "";
      document.getElementById("mf-entry-remarks").value = "";
      await loadManagerLoans();
    } catch (err) {
      showToast(err.message || "Failed to record manager entry.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Manager Entry";
    }
  });
}

// ============================================================================
// TAB 3: ALL ENTRIES
// ============================================================================
async function renderAllEntriesTab() {
  const container = document.getElementById("manager-finance-content");
  let currentPage = 1;
  let allEntries = [];

  const managersData = await apiCall("/api/manager-finance?tab=dashboard").catch(() => ({ managers: [] }));
  const managers = managersData.managers || [];

  container.innerHTML = `
    <header class="page-header" style="margin-bottom: 16px;">
      <div>
        <h2 style="font-size: 16px; font-weight: 700; margin: 0;">Manager Financial Ledger</h2>
        <p style="font-size: 12px; color: var(--secondary); margin: 2px 0 0;">Review, filter, and export manager transaction history.</p>
      </div>
      <div>
        <button class="btn btn-secondary" id="mf-export-btn">Export Report</button>
      </div>
    </header>

    <section class="filter-bar" style="margin-bottom: 16px;">
      <div class="form-group">
        <label class="form-label" for="mf-f-manager">Manager</label>
        <select class="select" id="mf-f-manager">
          <option value="">All managers</option>
          ${managers.map((m) => `<option value="${m.id}">${escapeHTML(m.full_name)}</option>`).join("")}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="mf-f-type">Type</label>
        <select class="select" id="mf-f-type">
          <option value="">All types</option>
          <option value="salary_given">Salary</option>
          <option value="loan_given">Loan Given</option>
          <option value="repayment">Repayment</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="mf-f-date">Date Range</label>
        <select class="select" id="mf-f-date">
          <option value="">All time</option>
          <option value="15">Last 15 days</option>
          <option value="30">Last 30 days</option>
          <option value="45">Last 45 days</option>
          <option value="60">Last 60 days</option>
          <option value="custom">Custom range</option>
        </select>
      </div>

      <div class="form-group hidden" id="mf-from-date-wrap">
        <label class="form-label" for="mf-from-date">From</label>
        <input class="input" id="mf-from-date" inputmode="numeric" placeholder="DD/MM/YYYY" maxlength="10">
      </div>

      <div class="form-group hidden" id="mf-to-date-wrap">
        <label class="form-label" for="mf-to-date">To</label>
        <input class="input" id="mf-to-date" inputmode="numeric" placeholder="DD/MM/YYYY" maxlength="10">
      </div>

      <div class="form-group">
        <label class="form-label" for="mf-f-amount">Amount Range</label>
        <select class="select" id="mf-f-amount">
          <option value="">All amounts</option>
          <option value="0-500">₹0 – ₹500</option>
          <option value="500-2000">₹500 – ₹2,000</option>
          <option value="2000-5000">₹2,000 – ₹5,000</option>
          <option value="5000-10000">₹5,000 – ₹10,000</option>
          <option value="10000-">Above ₹10,000</option>
          <option value="custom">Custom range</option>
        </select>
      </div>

      <div class="form-group hidden" id="mf-min-amount-wrap">
        <label class="form-label" for="mf-min-amount">Min ₹</label>
        <input class="input" id="mf-min-amount" type="number" min="0">
      </div>

      <div class="form-group hidden" id="mf-max-amount-wrap">
        <label class="form-label" for="mf-max-amount">Max ₹</label>
        <input class="input" id="mf-max-amount" type="number" min="0">
      </div>

      <button class="btn btn-secondary" id="mf-clear-filters" type="button">Clear Filters</button>
    </section>

    <section class="card table-card" style="margin: 0;">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Manager</th>
              <th>Type</th>
              <th class="amount-col">Amount</th>
              <th>Remarks</th>
              <th style="width: 80px; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody id="mf-entries-body">
            <tr class="skeleton-row"><td colspan="6"><span class="skeleton"></span></td></tr>
            <tr class="skeleton-row"><td colspan="6"><span class="skeleton"></span></td></tr>
          </tbody>
        </table>
      </div>
      <div id="mf-entries-pagination"></div>
    </section>
  `;

  function queryString(page = 1) {
    const params = new URLSearchParams();
    params.set("tab", "entries");
    params.set("page", String(page));
    params.set("limit", "25");

    const get = (id) => document.getElementById(id)?.value?.trim() || "";
    if (get("mf-f-manager")) params.set("managerId", get("mf-f-manager"));
    if (get("mf-f-type")) params.set("type", get("mf-f-type"));

    const dateFilter = get("mf-f-date");
    if (dateFilter && dateFilter !== "custom") params.set("days", dateFilter);
    else if (dateFilter === "custom") {
      const fromIso = toISODate(get("mf-from-date"));
      const toIso = toISODate(get("mf-to-date"));
      if (fromIso) params.set("fromDate", fromIso);
      if (toIso) params.set("toDate", toIso);
    }

    const amtFilter = get("mf-f-amount");
    if (amtFilter && amtFilter !== "custom") {
      const [min, max] = amtFilter.split("-");
      if (min) params.set("minAmount", min);
      if (max) params.set("maxAmount", max);
    } else if (amtFilter === "custom") {
      if (get("mf-min-amount")) params.set("minAmount", get("mf-min-amount"));
      if (get("mf-max-amount")) params.set("maxAmount", get("mf-max-amount"));
    }

    return params.toString();
  }

  async function loadEntries(page = 1) {
    currentPage = page;
    const body = document.getElementById("mf-entries-body");
    body.innerHTML = '<tr class="skeleton-row"><td colspan="6"><span class="skeleton"></span></td></tr>';

    try {
      const data = await apiCall(`/api/manager-finance?${queryString(page)}`);
      allEntries = data.entries || [];

      if (!allEntries.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty-state">No manager entries match the selected filters.</td></tr>';
        renderPagination(data.pagination, "mf-entries-pagination", loadEntries);
        return;
      }

      body.innerHTML = allEntries
        .map((entry) => {
          const typeClass =
            entry.entry_type === "salary_given"
              ? "badge-primary"
              : entry.entry_type === "loan_given"
                ? "badge-danger"
                : "badge-success";
          const typeLabel = entry.entry_type === "salary_given" ? "Salary" : entry.entry_type === "loan_given" ? "Loan Given" : "Repayment";

          return `
            <tr>
              <td>${formatDate(entry.entry_date)}</td>
              <td><strong>${escapeHTML(entry.manager_name)}</strong></td>
              <td><span class="badge ${typeClass}">${typeLabel}</span></td>
              <td class="amount-col">${formatINR(entry.amount)}</td>
              <td>${escapeHTML(entry.remarks || "—")}</td>
              <td style="text-align: right;">
                <button class="btn btn-sm btn-danger" data-delete-entry="${entry.id}">Delete</button>
              </td>
            </tr>
          `;
        })
        .join("");

      body.querySelectorAll("[data-delete-entry]").forEach((btn) => {
        btn.addEventListener("click", () => openDeleteEntryModal(btn.dataset.deleteEntry));
      });

      renderPagination(data.pagination, "mf-entries-pagination", loadEntries);
    } catch (err) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load manager entries.</td></tr>';
      showToast(err.message, "error");
    }
  }

  function openDeleteEntryModal(entryId) {
    const modal = openModal(`
      <div class="modal-header">
        <div>
          <h2 class="modal-title">Delete Manager Entry</h2>
          <p class="modal-subtitle">Permanently remove this transaction record</p>
        </div>
        <button class="icon-button" id="modal-close">×</button>
      </div>
      <div class="delete-content">
        <div class="delete-warning">
          <p>⚠️ <strong>Confirmation Required</strong></p>
          <p style="margin-top:6px;font-size:13px;color:var(--text-muted)">
            Deleting this entry will adjust related manager loan balances and permanently update financial ledgers.
          </p>
        </div>
        <div class="form-group" style="margin-bottom:14px;">
          <label class="form-label">Type <strong>CONFIRM</strong> to authorize</label>
          <input class="input" id="mf-delete-confirm-input" placeholder="Type CONFIRM here">
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="mf-cancel-delete">Cancel</button>
          <button class="btn btn-danger" id="mf-confirm-delete" disabled>Delete Entry</button>
        </div>
      </div>
    `);

    const input = document.getElementById("mf-delete-confirm-input");
    const confirmBtn = document.getElementById("mf-confirm-delete");

    input?.addEventListener("input", (e) => {
      confirmBtn.disabled = e.target.value.trim() !== "CONFIRM";
    });

    document.getElementById("mf-cancel-delete")?.addEventListener("click", closeModal);
    document.getElementById("modal-close")?.addEventListener("click", closeModal);

    confirmBtn?.addEventListener("click", async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Deleting…";
      try {
        await apiCall(`/api/manager-finance?tab=entries&id=${entryId}`, {
          method: "DELETE",
          body: JSON.stringify({ confirmText: "CONFIRM" }),
        });
        closeModal();
        showToast("Manager entry deleted successfully.", "success");
        loadEntries(currentPage);
      } catch (err) {
        showToast(err.message || "Failed to delete entry.", "error");
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Delete Entry";
      }
    });
  }

  // Export PDF / Print
  document.getElementById("mf-export-btn")?.addEventListener("click", () => {
    if (!allEntries.length) return showToast("No manager entries available to export.", "error");
    exportManagerEntriesReport(allEntries);
  });

  // Filter bindings
  const triggerReload = () => loadEntries(1);
  document.querySelectorAll(".filter-bar select").forEach((el) => el.addEventListener("change", triggerReload));
  document.querySelectorAll(".filter-bar input").forEach((el) => {
    el.addEventListener("change", triggerReload);
    el.addEventListener("input", debounce(triggerReload, 350));
  });

  document.getElementById("mf-f-date")?.addEventListener("change", (e) => {
    const isCustom = e.target.value === "custom";
    document.getElementById("mf-from-date-wrap")?.classList.toggle("hidden", !isCustom);
    document.getElementById("mf-to-date-wrap")?.classList.toggle("hidden", !isCustom);
  });

  document.getElementById("mf-f-amount")?.addEventListener("change", (e) => {
    const isCustom = e.target.value === "custom";
    document.getElementById("mf-min-amount-wrap")?.classList.toggle("hidden", !isCustom);
    document.getElementById("mf-max-amount-wrap")?.classList.toggle("hidden", !isCustom);
  });

  document.getElementById("mf-clear-filters")?.addEventListener("click", () => {
    document.querySelectorAll(".filter-bar select").forEach((el) => (el.selectedIndex = 0));
    document.querySelectorAll(".filter-bar input").forEach((el) => (el.value = ""));
    document.getElementById("mf-from-date-wrap")?.classList.add("hidden");
    document.getElementById("mf-to-date-wrap")?.classList.add("hidden");
    document.getElementById("mf-min-amount-wrap")?.classList.add("hidden");
    document.getElementById("mf-max-amount-wrap")?.classList.add("hidden");
    triggerReload();
  });

  loadEntries(1);
}

// ============================================================================
// TAB 4: LOANS OVERVIEW
// ============================================================================
async function renderLoansOverviewTab() {
  const container = document.getElementById("manager-finance-content");
  const managersData = await apiCall("/api/manager-finance?tab=dashboard").catch(() => ({ managers: [] }));
  const managers = managersData.managers || [];

  container.innerHTML = `
    <div id="mf-loans-kpis-wrap" style="margin-bottom: 20px;">
      <span class="skeleton" style="height: 90px; display: block; border-radius: 8px;"></span>
    </div>

    <header class="page-header" style="margin-bottom: 16px;">
      <div>
        <h2 style="font-size: 16px; font-weight: 700; margin: 0;">Manager Loan Records</h2>
        <p style="font-size: 12px; color: var(--secondary); margin: 2px 0 0;">Track corporate loan allocations, repayments, and progress.</p>
      </div>
      <div>
        <button class="btn btn-primary" id="btn-add-mf-loan">＋ Add Manager Loan</button>
      </div>
    </header>

    <section class="filter-bar" style="margin-bottom: 16px;">
      <div class="form-group">
        <label class="form-label" for="mf-l-manager">Manager</label>
        <select class="select" id="mf-l-manager">
          <option value="">All managers</option>
          ${managers.map((m) => `<option value="${m.id}">${escapeHTML(m.full_name)}</option>`).join("")}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="mf-l-status">Status</label>
        <select class="select" id="mf-l-status">
          <option value="">All loans</option>
          <option value="active" selected>Active</option>
          <option value="paid">Paid</option>
        </select>
      </div>
    </section>

    <section class="card table-card" style="margin: 0;">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Manager</th>
              <th>Loan Type</th>
              <th>Issue Date</th>
              <th class="amount-col">Loan Amount</th>
              <th class="amount-col">Repaid</th>
              <th class="amount-col">Remaining</th>
              <th style="min-width: 140px;">Progress</th>
              <th>Status</th>
              <th style="width: 80px; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody id="mf-loans-body">
            <tr class="skeleton-row"><td colspan="9"><span class="skeleton"></span></td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;

  async function loadLoans() {
    const body = document.getElementById("mf-loans-body");
    const kpiWrap = document.getElementById("mf-loans-kpis-wrap");
    body.innerHTML = '<tr class="skeleton-row"><td colspan="9"><span class="skeleton"></span></td></tr>';

    const mgr = document.getElementById("mf-l-manager")?.value || "";
    const st = document.getElementById("mf-l-status")?.value || "";

    const params = new URLSearchParams();
    params.set("tab", "loans");
    if (mgr) params.set("managerId", mgr);
    if (st) params.set("status", st);

    try {
      const data = await apiCall(`/api/manager-finance?${params.toString()}`);
      const k = data.kpis || {};
      const loans = data.loans || [];

      if (kpiWrap) {
        kpiWrap.innerHTML = `
          <section class="grid grid-4" style="gap: 14px;">
            <div class="card kpi-card danger">
              <span class="kpi-label">Outstanding Balance</span>
              <span class="kpi-value">${formatINR(k.total_outstanding)}</span>
            </div>
            <div class="card kpi-card success">
              <span class="kpi-label">Total Repaid</span>
              <span class="kpi-value">${formatINR(k.total_repaid)}</span>
            </div>
            <div class="card kpi-card neutral">
              <span class="kpi-label">Total Loans Issued</span>
              <span class="kpi-value">${formatINR(k.total_loans_amount)}</span>
            </div>
            <div class="card kpi-card primary">
              <span class="kpi-label">Active Loans Count</span>
              <span class="kpi-value">${k.active_count || 0}</span>
            </div>
          </section>
        `;
      }

      if (!loans.length) {
        body.innerHTML = '<tr><td colspan="9" class="empty-state">No manager loans match the selected filters.</td></tr>';
        return;
      }

      body.innerHTML = loans
        .map((loan) => {
          const percent = Number(loan.repaid_percentage || 0);
          const isPaid = loan.status === "paid";
          return `
            <tr>
              <td><strong>${escapeHTML(loan.manager_name)}</strong></td>
              <td><span class="badge ${loan.loan_type === "pre_system" ? "badge-warning" : "badge-primary"}">${loan.loan_type === "pre_system" ? "Before System" : "Regular"}</span></td>
              <td>${formatDate(loan.loan_date || loan.created_at)}</td>
              <td class="amount-col font-bold">${formatINR(loan.loan_amount)}</td>
              <td class="amount-col text-success">${formatINR(loan.repaid_amount)}</td>
              <td class="amount-col text-danger font-bold">${formatINR(loan.remaining_amount)}</td>
              <td>
                <div class="progress"><div class="progress-bar ${percent < 33 ? "low" : percent < 67 ? "medium" : ""}" style="width:${percent}%"></div></div>
                <span class="cell-meta">${percent}% repaid</span>
              </td>
              <td><span class="badge ${isPaid ? "badge-success" : "badge-warning"}">${isPaid ? "Paid" : "Active"}</span></td>
              <td style="text-align: right;">
                <button class="btn btn-sm btn-danger" data-delete-loan="${loan.id}">Delete</button>
              </td>
            </tr>
          `;
        })
        .join("");

      body.querySelectorAll("[data-delete-loan]").forEach((btn) => {
        btn.addEventListener("click", () => openDeleteLoanModal(btn.dataset.deleteLoan));
      });
    } catch (err) {
      body.innerHTML = '<tr><td colspan="9" class="empty-state">Failed to load manager loans.</td></tr>';
      showToast(err.message, "error");
    }
  }

  function openDeleteLoanModal(loanId) {
    const modal = openModal(`
      <div class="modal-header">
        <div>
          <h2 class="modal-title">Delete Manager Loan</h2>
          <p class="modal-subtitle">Permanently remove this manager loan record</p>
        </div>
        <button class="icon-button" id="modal-close">×</button>
      </div>
      <div class="delete-content">
        <div class="delete-warning">
          <p>⚠️ <strong>Permanent Action Warning</strong></p>
          <p style="margin-top:6px;font-size:13px;color:var(--text-muted)">
            Deleting this loan record will remove it from outstanding calculations and cannot be undone.
          </p>
        </div>
        <div class="form-group" style="margin-bottom:14px;">
          <label class="form-label">Type <strong>CONFIRM</strong> to authorize</label>
          <input class="input" id="mf-loan-delete-confirm" placeholder="Type CONFIRM here">
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="mf-cancel-loan-delete">Cancel</button>
          <button class="btn btn-danger" id="mf-confirm-loan-delete" disabled>Delete Loan</button>
        </div>
      </div>
    `);

    const input = document.getElementById("mf-loan-delete-confirm");
    const confirmBtn = document.getElementById("mf-confirm-loan-delete");

    input?.addEventListener("input", (e) => {
      confirmBtn.disabled = e.target.value.trim() !== "CONFIRM";
    });

    document.getElementById("mf-cancel-loan-delete")?.addEventListener("click", closeModal);
    document.getElementById("modal-close")?.addEventListener("click", closeModal);

    confirmBtn?.addEventListener("click", async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Deleting…";
      try {
        await apiCall(`/api/manager-finance?tab=loans&id=${loanId}`, {
          method: "DELETE",
          body: JSON.stringify({ confirmText: "CONFIRM" }),
        });
        closeModal();
        showToast("Manager loan deleted successfully.", "success");
        loadLoans();
      } catch (err) {
        showToast(err.message || "Failed to delete manager loan.", "error");
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Delete Loan";
      }
    });
  }

  // Add Manager Loan Modal
  document.getElementById("btn-add-mf-loan")?.addEventListener("click", () => {
    const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10));
    const modal = openModal(`
      <div class="modal-header">
        <div>
          <h2 class="modal-title">Add Manager Loan</h2>
          <p class="modal-subtitle">Issue a corporate loan or record a pre-system balance</p>
        </div>
        <button class="icon-button" id="modal-close">×</button>
      </div>
      <form id="mf-new-loan-form" class="form-grid" style="padding: 16px;">
        <div class="form-group full-width">
          <label class="form-label" for="mf-modal-manager">Manager</label>
          <select class="select" id="mf-modal-manager" required>
            <option value="">Select manager</option>
            ${managers.map((m) => `<option value="${m.id}">${escapeHTML(m.full_name)}</option>`).join("")}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="mf-modal-type">Loan Classification</label>
          <select class="select" id="mf-modal-type">
            <option value="regular">Regular Loan</option>
            <option value="pre_system">Pre-system Loan (Legacy Balance)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="mf-modal-amount">Loan Amount (₹)</label>
          <input class="input" id="mf-modal-amount" type="number" step="0.01" min="0.01" placeholder="Enter amount" required>
        </div>

        <div class="form-group">
          <label class="form-label" for="mf-modal-date">Issue Date</label>
          <input class="input" id="mf-modal-date" inputmode="numeric" placeholder="DD/MM/YYYY" maxlength="10" value="${todayDisplay}" required>
        </div>

        <div class="form-group full-width">
          <label class="form-label" for="mf-modal-reason">Reason / Purpose</label>
          <textarea class="textarea" id="mf-modal-reason" placeholder="Reason for corporate loan…"></textarea>
        </div>

        <div class="modal-footer full-width">
          <button class="btn btn-secondary" type="button" id="mf-cancel-new-loan">Cancel</button>
          <button class="btn btn-primary" type="submit" id="mf-submit-new-loan">Create Loan</button>
        </div>
      </form>
    `);

    document.getElementById("mf-cancel-new-loan")?.addEventListener("click", closeModal);
    document.getElementById("modal-close")?.addEventListener("click", closeModal);

    document.getElementById("mf-new-loan-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const mgrId = document.getElementById("mf-modal-manager").value;
      const loanType = document.getElementById("mf-modal-type").value;
      const amount = Number(document.getElementById("mf-modal-amount").value);
      const rawDate = document.getElementById("mf-modal-date").value;
      const isoDate = toISODate(rawDate);
      const reason = document.getElementById("mf-modal-reason").value;

      if (!mgrId) return showToast("Please select a manager.", "error");
      if (!amount || amount <= 0) return showToast("Please enter a valid loan amount.", "error");
      if (!isoDate) return showToast("Please enter a valid date in DD/MM/YYYY.", "error");

      const submitBtn = document.getElementById("mf-submit-new-loan");
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating…";

      try {
        await apiCall("/api/manager-finance?tab=loans", {
          method: "POST",
          body: JSON.stringify({
            managerId: mgrId,
            loanType,
            amount,
            loanDate: isoDate,
            reason,
          }),
        });

        closeModal();
        showToast("Manager loan created successfully.", "success");
        loadLoans();
      } catch (err) {
        showToast(err.message || "Failed to create loan.", "error");
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Loan";
      }
    });
  });

  document.getElementById("mf-l-manager")?.addEventListener("change", loadLoans);
  document.getElementById("mf-l-status")?.addEventListener("change", loadLoans);

  loadLoans();
}

// ============================================================================
// TAB 5: AUDIT LOGS
// ============================================================================
async function renderAuditLogsTab() {
  const container = document.getElementById("manager-finance-content");
  let currentPage = 1;

  const managersData = await apiCall("/api/manager-finance?tab=dashboard").catch(() => ({ managers: [] }));
  const managers = managersData.managers || [];

  container.innerHTML = `
    <header class="page-header" style="margin-bottom: 16px;">
      <div>
        <h2 style="font-size: 16px; font-weight: 700; margin: 0;">Manager Finance Audit Logs</h2>
        <p style="font-size: 12px; color: var(--secondary); margin: 2px 0 0;">Dedicated audit trail for all manager financial transactions.</p>
      </div>
    </header>

    <section class="filter-bar" style="margin-bottom: 16px;">
      <div class="form-group">
        <label class="form-label" for="mf-a-manager">Manager</label>
        <select class="select" id="mf-a-manager">
          <option value="">All managers</option>
          ${managers.map((m) => `<option value="${m.id}">${escapeHTML(m.full_name)}</option>`).join("")}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="mf-a-action">Action</label>
        <select class="select" id="mf-a-action">
          <option value="">All actions</option>
          <option value="MANAGER_LOAN_GIVEN">Manager Loan Given</option>
          <option value="MANAGER_REPAYMENT">Manager Repayment</option>
          <option value="MANAGER_SALARY_GIVEN">Manager Salary Given</option>
          <option value="MANAGER_ENTRY_DELETED">Manager Entry Deleted</option>
          <option value="MANAGER_LOAN_DELETED">Manager Loan Deleted</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="mf-a-date">Date Range</label>
        <select class="select" id="mf-a-date">
          <option value="">All time</option>
          <option value="15">Last 15 days</option>
          <option value="30">Last 30 days</option>
          <option value="45">Last 45 days</option>
          <option value="60">Last 60 days</option>
        </select>
      </div>
    </section>

    <section class="card table-card" style="margin: 0;">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Timestamp IST</th>
              <th>Performed By</th>
              <th>Action</th>
              <th>Manager</th>
              <th class="amount-col">Amount</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody id="mf-audit-body">
            <tr class="skeleton-row"><td colspan="6"><span class="skeleton"></span></td></tr>
          </tbody>
        </table>
      </div>
      <div id="mf-audit-pagination"></div>
    </section>
  `;

  function queryString(page = 1) {
    const params = new URLSearchParams();
    params.set("tab", "audit-logs");
    params.set("page", String(page));
    params.set("limit", "25");

    const mgr = document.getElementById("mf-a-manager")?.value;
    const act = document.getElementById("mf-a-action")?.value;
    const dt = document.getElementById("mf-a-date")?.value;

    if (mgr) params.set("managerId", mgr);
    if (act) params.set("actionType", act);
    if (dt) params.set("days", dt);

    return params.toString();
  }

  async function loadLogs(page = 1) {
    currentPage = page;
    const body = document.getElementById("mf-audit-body");
    body.innerHTML = '<tr class="skeleton-row"><td colspan="6"><span class="skeleton"></span></td></tr>';

    try {
      const data = await apiCall(`/api/manager-finance?${queryString(page)}`);
      const logs = data.logs || [];

      if (!logs.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty-state">No manager finance audit records found.</td></tr>';
        renderPagination(data.pagination, "mf-audit-pagination", loadLogs);
        return;
      }

      body.innerHTML = logs
        .map((log) => {
          const actionText = log.action_type.replace(/_/g, " ");
          const isDanger = log.action_type.includes("DELETED");
          const isSuccess = log.action_type.includes("REPAYMENT");
          const badgeClass = isDanger ? "badge-danger" : isSuccess ? "badge-success" : "badge-primary";

          return `
            <tr>
              <td>${formatDateTime(log.created_at)}</td>
              <td><strong>${escapeHTML(log.user_name || "Admin")}</strong><span class="cell-meta">${escapeHTML(log.user_role || "admin")}</span></td>
              <td><span class="badge ${badgeClass}">${escapeHTML(actionText)}</span></td>
              <td>${log.manager_name ? `<strong>${escapeHTML(log.manager_name)}</strong>` : "—"}</td>
              <td class="amount-col">${log.amount ? formatINR(log.amount) : "—"}</td>
              <td>${escapeHTML(log.description || "—")}</td>
            </tr>
          `;
        })
        .join("");

      renderPagination(data.pagination, "mf-audit-pagination", loadLogs);
    } catch (err) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load audit logs.</td></tr>';
      showToast(err.message, "error");
    }
  }

  document.getElementById("mf-a-manager")?.addEventListener("change", () => loadLogs(1));
  document.getElementById("mf-a-action")?.addEventListener("change", () => loadLogs(1));
  document.getElementById("mf-a-date")?.addEventListener("change", () => loadLogs(1));

  loadLogs(1);
}

// ============================================================================
// EXPORT REPORT (PDF) FOR MANAGER FINANCE
// ============================================================================
function exportManagerEntriesReport(entries) {
  const logoUrl = `${window.location.origin}/apple-touch-icon.png`;
  const generatedAt = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const chronological = [...entries].sort(
    (a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime() || Number(a.id) - Number(b.id),
  );

  const managerBalances = {};
  let totalSalary = 0;
  let totalLoans = 0;
  let totalRepayments = 0;
  const balanceMap = new Map();

  for (const entry of chronological) {
    const key = entry.manager_id || entry.manager_name || "all";
    if (managerBalances[key] === undefined) managerBalances[key] = 0;
    const amt = Number(entry.amount) || 0;
    if (entry.entry_type === "loan_given") {
      managerBalances[key] += amt;
      totalLoans += amt;
    } else if (entry.entry_type === "repayment") {
      managerBalances[key] = Math.max(0, managerBalances[key] - amt);
      totalRepayments += amt;
    } else if (entry.entry_type === "salary_given") {
      totalSalary += amt;
    }
    balanceMap.set(entry.id, managerBalances[key]);
  }

  const rowsHtml = chronological
    .map((entry) => {
      const typeLabel = entry.entry_type === "salary_given" ? "Salary" : entry.entry_type === "loan_given" ? "Loan Given" : "Loan Repayment";
      const typeBadge =
        entry.entry_type === "salary_given" ? "badge-salary" : entry.entry_type === "loan_given" ? "badge-loan" : "badge-repayment";
      const bal = balanceMap.get(entry.id) ?? 0;
      const isLoanOrRepay = entry.entry_type === "loan_given" || entry.entry_type === "repayment";

      return `
      <tr>
        <td>${formatDate(entry.entry_date)}</td>
        <td class="emp-name">${escapeHTML(entry.manager_name || "—")}</td>
        <td><span class="type-badge ${typeBadge}">${typeLabel}</span></td>
        <td class="amount-val">${formatINR(entry.amount)}</td>
        <td class="balance-val ${bal === 0 ? "cleared" : ""}">${isLoanOrRepay || bal > 0 ? formatINR(bal) : "₹0.00"}</td>
      </tr>
    `;
    })
    .join("");

  const content = `
    <header class="report-header">
      <div class="brand-group">
        <img src="${logoUrl}" alt="Company Logo" class="brand-logo" onerror="this.style.display='none'">
        <div>
          <h1 class="report-title">Salary & Loan Tracker</h1>
          <p class="report-subtitle">Official Manager Financial & Loan Ledger Report</p>
        </div>
      </div>
      <div class="report-meta">
        <span class="meta-pill">Manager Finance</span>
        <div>Total: <strong>${entries.length}</strong> Records</div>
      </div>
    </header>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Total Transactions</div>
        <div class="summary-val">${entries.length}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Total Salary Paid</div>
        <div class="summary-val primary">${formatINR(totalSalary)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Total Loans Issued</div>
        <div class="summary-val danger">${formatINR(totalLoans)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Total Repayments</div>
        <div class="summary-val success">${formatINR(totalRepayments)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 15%">Date</th>
          <th style="width: 32%">Manager</th>
          <th style="width: 20%">Type</th>
          <th class="amount-col" style="width: 16%">Amount</th>
          <th class="balance-col" style="width: 17%">Loan Balance</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <footer class="report-footer">
      <span>Generated via Salary & Loan Tracker Portal (Manager Finance)</span>
      <span>${generatedAt} IST</span>
    </footer>
  `;

  const popup = window.open("", "_blank");
  if (!popup) return showToast("Please allow popups to print/export report.", "error");

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Manager Financial Entries Report</title>
  <style>
    @page { margin: 12mm 15mm; size: A4 portrait; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; padding: 24px; max-width: 900px; margin: 0 auto; line-height: 1.5; }
    .report-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0f766e; padding-bottom: 20px; margin-bottom: 22px; }
    .brand-group { display: flex; align-items: center; gap: 14px; }
    .brand-logo { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; }
    .report-title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0; }
    .report-subtitle { margin: 2px 0 0; color: #64748b; font-size: 12px; }
    .report-meta { text-align: right; font-size: 11.5px; color: #475569; }
    .meta-pill { display: inline-block; padding: 3px 9px; border-radius: 12px; background: #f1f5f9; font-weight: 600; font-size: 11px; margin-bottom: 4px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .summary-card { padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
    .summary-label { font-size: 10.5px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
    .summary-val { font-size: 16px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
    .summary-val.success { color: #16a34a; }
    .summary-val.danger { color: #dc2626; }
    .summary-val.primary { color: #0f766e; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    thead th { padding: 10px 12px; background: #f1f5f9; color: #334155; font-weight: 700; font-size: 11px; text-transform: uppercase; border-bottom: 1.5px solid #cbd5e1; text-align: left; }
    thead th.amount-col, thead th.balance-col { text-align: right; }
    tbody td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
    tbody tr:nth-child(even) { background: #fafafa; }
    .emp-name { font-weight: 600; color: #0f172a; }
    .type-badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
    .badge-salary { background: #e0f2fe; color: #0369a1; }
    .badge-loan { background: #fee2e2; color: #b91c1c; }
    .badge-repayment { background: #dcfce7; color: #15803d; }
    .amount-val, .balance-val { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
    .balance-val.cleared { color: #64748b; font-weight: 500; }
    .report-footer { display: flex; justify-content: space-between; margin-top: 28px; padding-top: 14px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 11px; }
    @media print { body { padding: 0; max-width: 100%; } tr { page-break-inside: avoid; } }
  </style>
</head>
<body>${content}</body>
</html>`);
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 400);
}

// ============================================================================
// SHARED PAGINATION RENDERER
// ============================================================================
function renderPagination(pagination, containerId, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container || !pagination) return;

  const { page, pages, total } = pagination;
  if (pages <= 1 && total <= 25) {
    container.innerHTML = `<div class="pagination-info" style="padding: 12px 16px;">Showing all ${total} records</div>`;
    return;
  }

  let pagesHtml = "";
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, page + 2);

  for (let i = start; i <= end; i++) {
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
      const p = Number(btn.dataset.page);
      if (p && p !== page) onPageChange(p);
    });
  });
}
