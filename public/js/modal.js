export function openModal(content) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "modal-overlay";
  overlay.innerHTML = `<section class="modal" role="dialog" aria-modal="true">${content}</section>`;
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal();
  });
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  return overlay.querySelector(".modal");
}
export function closeModal() {
  document.getElementById("modal-overlay")?.remove();
  document.body.style.overflow = "";
}
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});
