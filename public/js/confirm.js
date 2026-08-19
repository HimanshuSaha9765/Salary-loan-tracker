import { openModal, closeModal } from "./modal.js";

export function showConfirm({
  title = "Please confirm",
  message = "Are you sure?",
  confirmText = "Confirm",
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const modal = openModal(
      `<div class="modal-header"><h2 class="modal-title">${title}</h2><button class="icon-button" id="confirm-close">×</button></div><p>${message}</p><div class="modal-footer"><button class="btn btn-secondary" id="confirm-cancel">Cancel</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirm-action">${confirmText}</button></div>`,
    );
    const done = (value) => {
      closeModal();
      resolve(value);
    };
    modal
      .querySelector("#confirm-close")
      .addEventListener("click", () => done(false));
    modal
      .querySelector("#confirm-cancel")
      .addEventListener("click", () => done(false));
    modal
      .querySelector("#confirm-action")
      .addEventListener("click", () => done(true));
  });
}
