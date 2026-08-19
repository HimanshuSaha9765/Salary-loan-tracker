import { apiCall, debounce, escapeHTML, requireAdmin } from "../app.js";
import { initNav } from "../nav.js";
import { showToast } from "../toast.js";

const user = await requireAdmin();
let employees = [];
let managers = [];
if (user) {
  initNav("assignments");
  bindPage();
  loadAssignments();
}

function bindPage() {
  document
    .getElementById("assignment-search")
    .addEventListener("input", debounce(renderAssignments));
}
async function loadAssignments() {
  const body = document.getElementById("assignments-body");
  body.innerHTML =
    '<tr class="skeleton-row"><td colspan="3"><span class="skeleton"></span></td></tr><tr class="skeleton-row"><td colspan="3"><span class="skeleton"></span></td></tr>';
  try {
    const data = await apiCall("/api/assignments");
    employees = data.employees;
    managers = data.managers;
    renderAssignments();
  } catch (error) {
    body.innerHTML =
      '<tr><td colspan="3" class="empty-state">Unable to load assignments. Please try again.</td></tr>';
    showToast(
      "Assignment information could not be loaded. Please try again.",
      "error",
    );
  }
}
function renderAssignments() {
  const body = document.getElementById("assignments-body");
  const search = document
    .getElementById("assignment-search")
    .value.trim()
    .toLowerCase();
  const filtered = employees.filter((employee) =>
    `${employee.full_name} ${employee.emp_code}`.toLowerCase().includes(search),
  );
  body.innerHTML =
    filtered
      .map(
        (employee) =>
          `<tr><td><strong>${escapeHTML(employee.full_name)}</strong><span class="cell-meta">${employee.emp_code}</span></td><td>${escapeHTML(employee.manager_name || "Unassigned")}</td><td><select class="select assignment-select" data-id="${employee.id}"><option value="">Unassigned</option>${managers.map((manager) => `<option value="${manager.id}" ${Number(manager.id) === Number(employee.manager_id) ? "selected" : ""}>${escapeHTML(manager.full_name)}</option>`).join("")}</select></td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="3" class="empty-state">No employees match your search.</td></tr>';
  body
    .querySelectorAll(".assignment-select")
    .forEach((select) =>
      select.addEventListener("change", () => saveAssignment(select)),
    );
}
async function saveAssignment(select) {
  select.disabled = true;
  try {
    await apiCall("/api/assignments", {
      method: "PUT",
      body: JSON.stringify({
        employeeId: select.dataset.id,
        managerId: select.value || null,
      }),
    });
    const employee = employees.find(
      (item) => Number(item.id) === Number(select.dataset.id),
    );
    const manager = managers.find(
      (item) => Number(item.id) === Number(select.value),
    );
    employee.manager_id = select.value || null;
    employee.manager_name = manager?.full_name || null;
    renderAssignments();
    showToast("Manager assignment updated successfully.", "success");
  } catch (error) {
    showToast(error.message, "error");
    renderAssignments();
  } finally {
    select.disabled = false;
  }
}
