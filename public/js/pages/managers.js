import { apiCall, escapeHTML, formatINR, requireAdmin } from "../app.js";
import { initNav } from "../nav.js";
import { openModal, closeModal } from "../modal.js";
import { showToast } from "../toast.js";

const user = await requireAdmin();
if (user) {
  initNav("managers");
  document
    .getElementById("create-manager")
    ?.addEventListener("click", () => openManagerModal());
  loadManagers();
}

async function loadManagers() {
  const body = document.getElementById("managers-body");
  body.innerHTML =
    '<tr class="skeleton-row"><td colspan="7"><span class="skeleton"></span></td></tr><tr class="skeleton-row"><td colspan="7"><span class="skeleton"></span></td></tr>';
  try {
    const data = await apiCall("/api/managers");
    body.innerHTML =
      data.managers
        .map(
          (manager) =>
            `<tr><td><strong>${escapeHTML(manager.full_name)}</strong></td><td>${escapeHTML(manager.username)}</td><td>${escapeHTML(manager.phone || "—")}</td><td>${manager.team_size}</td><td class="${Number(manager.outstanding) > 0 ? "text-danger" : "text-success"}">${formatINR(manager.outstanding)}</td><td><span class="badge ${manager.is_active ? "badge-success" : "badge-warning"}">${manager.is_active ? "Active" : "Inactive"}</span></td><td><button class="btn btn-sm btn-secondary" data-action="edit" data-id="${manager.id}">Edit</button> <button class="btn btn-sm btn-secondary" data-action="toggle" data-id="${manager.id}">${manager.is_active ? "Deactivate" : "Activate"}</button> <button class="btn btn-sm btn-danger" data-action="delete" data-id="${manager.id}">Delete</button></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="7" class="empty-state">No manager accounts have been created.</td></tr>';
    body.querySelectorAll("[data-action]").forEach((button) => {
      const manager = data.managers.find(
        (item) => Number(item.id) === Number(button.dataset.id),
      );
      button.addEventListener("click", () => {
        if (button.dataset.action === "edit") openManagerModal(manager);
        if (button.dataset.action === "toggle") {
          button.disabled = true;
          button.textContent = manager.is_active
            ? "Deactivating…"
            : "Activating…";
          saveManager(manager, { isActive: !manager.is_active });
        }
        if (button.dataset.action === "delete") deleteManager(manager);
      });
    });
  } catch (error) {
    body.innerHTML =
      '<tr><td colspan="7" class="empty-state">Unable to load managers. Please try again.</td></tr>';
    showToast(
      "Manager information could not be loaded. Please try again.",
      "error",
    );
  }
}

function openManagerModal(manager = null) {
  const editing = Boolean(manager);
  const modal = openModal(
    `<div class="modal-header"><h2 class="modal-title">${editing ? "Edit Manager" : "Create Manager"}</h2><button class="icon-button" id="close-manager">×</button></div><form id="manager-form" class="form-grid"><div class="form-group"><label class="form-label">Full Name</label><input class="input" id="manager-name" value="${escapeHTML(manager?.full_name || "")}" required></div><div class="form-group"><label class="form-label">Username</label><input class="input" id="manager-username" value="${escapeHTML(manager?.username || "")}" required></div><div class="form-group"><label class="form-label">${editing ? "New Password (optional)" : "Password"}</label><input class="input" id="manager-password" type="password" ${editing ? "" : "required"}></div><div class="form-group"><label class="form-label">Phone</label><input class="input" id="manager-phone" value="${escapeHTML(manager?.phone || "")}"></div><div class="form-group full-width"><label class="form-label">Pre-system Loan Balance</label><input class="input" id="manager-preloan" type="number" min="0" step="0.01" value="${manager?.pre_system_loan || 0}"><span class="form-hint">Enter 0 when there was no balance before this system.</span></div><div class="modal-footer form-group full-width"><button class="btn btn-secondary" type="button" id="cancel-manager">Cancel</button><button class="btn btn-primary" type="submit">${editing ? "Save Changes" : "Create Manager"}</button></div></form>`,
  );
  modal.querySelector("#close-manager").addEventListener("click", closeModal);
  modal.querySelector("#cancel-manager").addEventListener("click", closeModal);
  modal.querySelector("#manager-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    button.textContent = editing ? "Saving…" : "Creating…";
    saveManager(
      manager,
      {
        fullName: modal.querySelector("#manager-name").value,
        username: modal.querySelector("#manager-username").value,
        password: modal.querySelector("#manager-password").value,
        phone: modal.querySelector("#manager-phone").value,
        preSystemLoan: modal.querySelector("#manager-preloan").value,
      },
      button,
    );
  });
}

async function saveManager(manager, changes, button = null) {
  try {
    if (manager) {
      await apiCall(`/api/managers?id=${manager.id}`, {
        method: "PUT",
        body: JSON.stringify({
          fullName: changes.fullName ?? manager.full_name,
          username: changes.username ?? manager.username,
          password: changes.password || undefined,
          phone: changes.phone ?? manager.phone,
          isActive: changes.isActive ?? manager.is_active,
          preSystemLoan: changes.preSystemLoan ?? manager.pre_system_loan,
        }),
      });
      showToast("Manager profile updated successfully.", "success");
    } else {
      await apiCall("/api/managers", {
        method: "POST",
        body: JSON.stringify(changes),
      });
      showToast("Manager account created successfully.", "success");
    }
    closeModal();
    loadManagers();
  } catch (error) {
    showToast(error.message, "error");
    if (button) {
      button.disabled = false;
      button.textContent = manager ? "Save Changes" : "Create Manager";
    }
  }
}

function deleteManager(manager) {
  const modal = openModal(
    `<div class="modal-header"><h2 class="modal-title">Permanent Delete</h2><button class="icon-button" id="close-delete">×</button></div><p>This permanently deletes <strong>${escapeHTML(manager.full_name)}</strong>. Assigned employees will become unassigned. Deletion is blocked when manager loan records exist.</p><label class="form-label">Type CONFIRM to continue</label><input class="input" id="delete-confirm" autocomplete="off"><div class="modal-footer"><button class="btn btn-secondary" id="cancel-delete">Cancel</button><button class="btn btn-danger" id="confirm-delete" disabled>Permanent Delete</button></div>`,
  );
  const input = modal.querySelector("#delete-confirm");
  const button = modal.querySelector("#confirm-delete");
  input.addEventListener(
    "input",
    () => (button.disabled = input.value !== "CONFIRM"),
  );
  modal.querySelector("#close-delete").addEventListener("click", closeModal);
  modal.querySelector("#cancel-delete").addEventListener("click", closeModal);
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Deleting…";
    try {
      await apiCall(`/api/managers?id=${manager.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation: "CONFIRM" }),
      });
      closeModal();
      showToast(
        "Manager permanently deleted. Assigned employees are now unassigned.",
        "success",
      );
      loadManagers();
    } catch (error) {
      showToast(error.message, "error");
      button.disabled = false;
      button.textContent = "Permanent Delete";
    }
  });
}
