function professionalMessage(message, type) {
  const value = String(message || "").trim();
  if (type === "success") return value;
  if (value.includes("No active loan balance"))
    return "This employee does not have an active loan available for repayment.";
  if (value.includes("Only ₹"))
    return `The repayment amount is higher than the available loan balance. ${value}`;
  if (value.includes("Select a valid active loan"))
    return "Please select an active loan before recording this repayment.";
  if (value.includes("Authentication required") || value.includes("jwt"))
    return "Your session has ended. Please sign in again.";
  if (value.includes("Failed to fetch") || value.includes("fetch failed"))
    return "We could not connect to the server. Please check your connection and try again.";
  return value || (type === "error"
    ? "We could not complete that action. Please review the details and try again."
    : "");
}

export function showToast(message, type = "info") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  const icons = { success: "✓", error: "!", info: "i" };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><div class="toast-message">${professionalMessage(message, type)}</div><button class="icon-button" type="button" aria-label="Dismiss notification">×</button>`;
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.add("hiding");
    setTimeout(() => toast.remove(), 300);
  };
  toast.querySelector("button").addEventListener("click", dismiss);
  container.appendChild(toast);
  setTimeout(dismiss, 4200);
}
