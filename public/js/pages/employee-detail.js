import { apiCall, escapeHTML, formatDate, formatINR, requireAuth } from "../app.js";
import { initNav } from "../nav.js";
import { showToast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { exportEmployeeStatement } from "../pdf.js";

const user = await requireAuth();
const id = new URLSearchParams(location.search).get("id");
function toISODate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/.exec(trimmed);
  if (!match) return null;
  let [, day, month, year] = match;
  if (year.length === 2) year = `20${year}`;
  day = day.padStart(2, "0");
  month = month.padStart(2, "0");
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  )
    return null;
  return `${year}-${month}-${day}`;
}
if (user) {
  initNav("employees");
  if (!id) renderCreate();
  else loadEmployee();
}

async function renderCreate() {
  document.getElementById("employee-breadcrumb").textContent = "New employee";
  document.getElementById("employee-name").textContent = "Add Employee";
  
  const isManager = user.role === "manager";
  const managerFieldHtml = isManager
    ? `<div class="form-group"><label class="form-label">Assigned Manager</label><input class="input" value="${escapeHTML(user.fullName)}" readonly disabled style="background:var(--surface-hover);opacity:0.9;font-weight:600"><input type="hidden" id="manager-id" value="${user.id}"><span class="form-hint">Employee will be automatically created under your supervision.</span></div>`
    : `<div class="form-group"><label class="form-label">Assign Manager</label><select class="select" id="manager-id"><option value="">Unassigned</option></select><span class="form-hint" id="manager-help">Loading manager options…</span></div>`;

  document.getElementById("profile-card").innerHTML =
    `<h2>Employee Profile</h2><form id="employee-form" class="form-grid"><div class="form-group"><label class="form-label">Full Name</label><input class="input" id="full-name" required></div><div class="form-group"><label class="form-label">Phone</label><input class="input" id="phone"></div><div class="form-group"><label class="form-label">Designation</label><input class="input" id="designation"></div><div class="form-group"><label class="form-label">Department</label><input class="input" id="department"></div><div class="form-group"><label class="form-label">Join Date</label><input class="input" id="join-date" inputmode="numeric" placeholder="DD/MM/YYYY" maxlength="10"></div><div class="form-group"><label class="form-label">Pre-system Loan</label><input class="input" id="pre-loan" type="number" min="0" value="0"></div>${managerFieldHtml}<div class="form-group full-width"><label class="form-label">Notes</label><textarea class="textarea" id="notes"></textarea></div><div class="form-group full-width"><button class="btn btn-primary" type="submit">Create Employee</button></div></form>`;
  
  document.getElementById("employee-kpis")?.remove();
  document.querySelector(".card[style]")?.remove();
  document
    .getElementById("employee-form")
    .addEventListener("submit", saveEmployee);

  if (!isManager) {
    try {
      const data = await apiCall("/api/managers");
      const select = document.getElementById("manager-id");
      select.innerHTML =
        '<option value="">Unassigned</option>' +
        data.managers
          .filter((manager) => manager.is_active)
          .map(
            (manager) =>
              `<option value="${manager.id}">${escapeHTML(manager.full_name)}</option>`,
          )
          .join("");
      const activeManagers = data.managers.filter((manager) => manager.is_active);
      if (activeManagers.length > 1) {
        select.required = true;
        document.getElementById("manager-help").textContent =
          "Manager assignment is required because multiple active managers exist.";
      } else {
        document.getElementById("manager-help").textContent =
          activeManagers.length
            ? "This manager will be assigned automatically."
            : "No active manager exists. This employee will remain unassigned.";
      }
    } catch {
      document.getElementById("manager-help").textContent =
        "Manager options could not be loaded. The employee will remain unassigned.";
    }
  }
}
async function saveEmployee(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  button.textContent = "Creating employee…";
  try {
    const result = await apiCall("/api/employees", {
      method: "POST",
      body: JSON.stringify({
        fullName: document.getElementById("full-name").value,
        phone: document.getElementById("phone").value,
        designation: document.getElementById("designation").value,
        department: document.getElementById("department").value,
        joinDate: toISODate(document.getElementById("join-date").value),
        notes: document.getElementById("notes").value,
        preSystemLoan: document.getElementById("pre-loan").value,
        managerId: document.getElementById("manager-id").value,
      }),
    });
    showToast("Employee created successfully", "success");
    setTimeout(
      () => (location.href = `/employee-detail?id=${result.employee.id}`),
      500,
    );
  } catch (error) {
    showToast(error.message, "error");
    button.disabled = false;
    button.textContent = "Create Employee";
  }
}
async function loadEmployee() {
  try {
    const employee = (await apiCall(`/api/employees?id=${id}`)).employee;
    if (!employee) throw new Error("Employee not found");
    const loans = (await apiCall(`/api/loans?employeeId=${id}`)).loans;
    const entries = (await apiCall(`/api/entries?employeeId=${id}`)).entries;
    document.getElementById("employee-breadcrumb").textContent =
      employee.full_name;
    document.getElementById("employee-name").textContent = employee.full_name;
    addActions(employee, loans, entries);
    document.getElementById("profile-card").innerHTML =
      `<div class="grid grid-3"><div><span class="cell-meta">Employee Code</span><strong>${employee.emp_code}</strong></div><div><span class="cell-meta">Phone</span><strong>${escapeHTML(employee.phone || "—")}</strong></div><div><span class="cell-meta">Manager</span><strong>${escapeHTML(employee.manager_name || "Unassigned")}</strong></div><div><span class="cell-meta">Designation</span><strong>${escapeHTML(employee.designation || "—")}</strong></div><div><span class="cell-meta">Department</span><strong>${escapeHTML(employee.department || "—")}</strong></div><div><span class="cell-meta">Status</span><strong>${employee.is_active ? "Active" : "Inactive"}</strong></div></div>`;
    const total = loans.reduce(
      (sum, loan) => sum + Number(loan.loan_amount),
      0,
    );
    const outstanding = loans.reduce(
      (sum, loan) => sum + Number(loan.remaining_amount),
      0,
    );
    const repaid = total - outstanding;
    const salary = entries
      .filter((entry) => entry.entry_type === "salary_given")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    document.getElementById("employee-kpis").innerHTML = [
      ["Outstanding", outstanding, "danger"],
      ["Total Repaid", repaid, "success"],
      ["Total Salary", salary, ""],
      ["Total Loans", total, "neutral"],
    ]
      .map(
        (item) =>
          `<div class="card kpi-card ${item[2]}"><span class="kpi-label">${item[0]}</span><div class="kpi-value">${formatINR(item[1])}</div></div>`,
      )
      .join("");
    document.getElementById("employee-detail-content").innerHTML =
      loanTable(loans);
    bindDetailTabs(loans, entries);
  } catch (error) {
    document.getElementById("profile-card").innerHTML =
      `<div class="empty-state">Unable to load employee details.<br><button class="btn btn-secondary" onclick="location.reload()">Try again</button></div>`;
    showToast(error.message, "error");
  }
}

function addActions(employee, loans, entries = []) {
  const actions = document.querySelector(".page-header>div:last-child");
  if (!actions) return;
  actions.innerHTML = `
    <button class="btn btn-secondary" id="export-statement">Export Statement</button>
    ${user.role === "admin" ? `
      <a class="btn btn-primary" href="/add-entry">Add Entry</a>
      <button class="btn btn-secondary" id="edit-employee">Edit Profile</button>
      <button class="btn btn-secondary" id="toggle-employee">${employee.is_active ? "Deactivate" : "Activate"}</button>
      <button class="btn btn-danger" id="delete-employee">Permanent Delete</button>
    ` : ""}
  `;
  document
    .getElementById("export-statement")
    ?.addEventListener("click", () => exportEmployeeStatement(employee, loans, entries));
  document
    .getElementById("edit-employee")
    ?.addEventListener("click", () => editEmployee(employee, loans));
  document
    .getElementById("toggle-employee")
    ?.addEventListener("click", (event) =>
      updateEmployee(
        employee,
        { isActive: !employee.is_active },
        event.currentTarget,
      ),
    );
  document
    .getElementById("delete-employee")
    ?.addEventListener("click", () => deleteEmployee(employee, loans));
}
function editEmployee(employee, loans) {
  const modal = openModal(
    `<div class="modal-header"><h2 class="modal-title">Edit ${escapeHTML(employee.full_name)}</h2><button class="icon-button" id="modal-close">×</button></div><form id="edit-form" class="form-grid"><div class="form-group"><label class="form-label">Full Name</label><input class="input" id="edit-name" value="${escapeHTML(employee.full_name)}" required></div><div class="form-group"><label class="form-label">Phone</label><input class="input" id="edit-phone" value="${escapeHTML(employee.phone || "")}"></div><div class="form-group"><label class="form-label">Designation</label><input class="input" id="edit-designation" value="${escapeHTML(employee.designation || "")}"></div><div class="form-group"><label class="form-label">Department</label><input class="input" id="edit-department" value="${escapeHTML(employee.department || "")}"></div><div class="form-group"><label class="form-label">Pre-system Loan Amount</label><input class="input" id="edit-preloan" type="number" min="0" value="${loans.find((loan) => loan.loan_type === "pre_system")?.loan_amount || 0}"></div><div class="modal-footer form-group full-width"><button class="btn btn-secondary" type="button" id="cancel-edit">Cancel</button><button class="btn btn-primary" type="submit">Save Changes</button></div></form>`,
  );
  modal.querySelector("#modal-close").addEventListener("click", closeModal);
  modal.querySelector("#cancel-edit").addEventListener("click", closeModal);
  modal
    .querySelector("#edit-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      button.textContent = "Saving…";
      await updateEmployee(employee, {
        fullName: modal.querySelector("#edit-name").value,
        phone: modal.querySelector("#edit-phone").value,
        designation: modal.querySelector("#edit-designation").value,
        department: modal.querySelector("#edit-department").value,
        preSystemLoan: modal.querySelector("#edit-preloan").value,
      });
      closeModal();
    });
}
async function updateEmployee(employee, changes, button = null) {
  if (button) {
    button.disabled = true;
    button.textContent = changes.isActive ? "Activating…" : "Deactivating…";
  }
  try {
    await apiCall(`/api/employees?id=${employee.id}`, {
      method: "PUT",
      body: JSON.stringify({
        fullName: changes.fullName ?? employee.full_name,
        phone: changes.phone ?? employee.phone,
        designation: changes.designation ?? employee.designation,
        department: changes.department ?? employee.department,
        aadhaar: employee.aadhaar,
        address: employee.address,
        emergencyContact: employee.emergency_contact,
        notes: employee.notes,
        joinDate: employee.join_date,
        managerId: employee.manager_id,
        isActive: changes.isActive ?? employee.is_active,
        ...(changes.preSystemLoan !== undefined
          ? { preSystemLoan: changes.preSystemLoan }
          : {}),
      }),
    });
    showToast("Employee updated successfully", "success");
    setTimeout(() => location.reload(), 350);
  } catch (error) {
    showToast(error.message, "error");
    if (button) {
      button.disabled = false;
      button.textContent = changes.isActive ? "Activate" : "Deactivate";
    }
  }
}
function deleteEmployee(employee, loans) {
  const modal = openModal(
    `<div class="modal-header"><div><h2 class="modal-title">Permanently delete employee</h2><p class="modal-subtitle">This cannot be undone.</p></div><button class="icon-button" id="modal-close">×</button></div><div class="delete-content"><div class="delete-identity"><span class="delete-avatar">${escapeHTML(employee.full_name.charAt(0).toUpperCase())}</span><div><strong>${escapeHTML(employee.full_name)}</strong><span>${employee.emp_code}</span></div></div><div class="danger-notice"><strong>Permanent action</strong><span>All employee entries and paid loan records will be removed. Deletion is blocked when any outstanding loan balance exists.</span></div><div class="form-group"><label class="form-label" for="delete-confirm">Confirmation phrase</label><input class="input" id="delete-confirm" autocomplete="off" placeholder="Type CONFIRM"><span class="form-hint">Enter CONFIRM exactly to enable deletion.</span></div></div><div class="modal-footer"><button class="btn btn-secondary" id="cancel-delete">Cancel</button><button class="btn btn-danger" id="confirm-delete" disabled>Permanent Delete</button></div>`,
  );
  const input = modal.querySelector("#delete-confirm");
  const button = modal.querySelector("#confirm-delete");
  input.addEventListener(
    "input",
    () => (button.disabled = input.value !== "CONFIRM"),
  );
  modal.querySelector("#modal-close").addEventListener("click", closeModal);
  modal.querySelector("#cancel-delete").addEventListener("click", closeModal);
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Deleting…";
    try {
      await apiCall(`/api/employees?id=${employee.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation: "CONFIRM" }),
      });
      showToast("Employee permanently deleted.", "success");
      setTimeout(() => (location.href = "/employees"), 400);
    } catch (error) {
      showToast(error.message, "error");
      button.disabled = false;
      button.textContent = "Permanent Delete";
    }
  });
}

function loanTable(loans) {
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Loan Type</th><th>Loan Date</th><th>Amount</th><th>Remaining</th><th>Status</th></tr></thead><tbody>${loans.map((loan) => `<tr><td>${loan.loan_type === "pre_system" ? "Before System" : "Regular Loan"}</td><td>${loan.loan_type === "pre_system" ? "Before System" : formatDate(loan.loan_date || loan.created_at)}</td><td>${formatINR(loan.loan_amount)}</td><td>${formatINR(loan.remaining_amount)}</td><td><span class="badge ${loan.status === "active" ? "badge-warning" : "badge-success"}">${loan.status}</span></td></tr>`).join("") || '<tr><td colspan="5" class="empty-state">No loans recorded.</td></tr>'}</tbody></table></div>`;
}
function transactionTable(entries) {
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Mode</th><th>Remarks</th></tr></thead><tbody>${entries.map((entry) => `<tr class="${entry.is_deleted ? "deleted-row" : ""}"><td>${formatDate(entry.entry_date)}</td><td><span class="badge badge-primary">${entry.entry_type.replace("_", " ")}</span></td><td>${formatINR(entry.amount)}</td><td>${entry.repayment_mode || "—"}</td><td>${escapeHTML(entry.remarks || "—")}</td></tr>`).join("") || '<tr><td colspan="5" class="empty-state">No transactions recorded.</td></tr>'}</tbody></table></div>`;
}
function bindDetailTabs(loans, entries) {
  const tabs = document.querySelectorAll(".tab");
  if (tabs.length < 2) return;
  tabs[0].addEventListener("click", () => {
    tabs.forEach((tab) => tab.classList.remove("active"));
    tabs[0].classList.add("active");
    document.getElementById("employee-detail-content").innerHTML =
      loanTable(loans);
  });
  tabs[1].addEventListener("click", () => {
    tabs.forEach((tab) => tab.classList.remove("active"));
    tabs[1].classList.add("active");
    document.getElementById("employee-detail-content").innerHTML =
      transactionTable(entries);
  });
}
