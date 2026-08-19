import { apiCall, getUser, requireAdmin } from "../app.js";
import { initNav } from "../nav.js";
import { showToast } from "../toast.js";

const user = await requireAdmin();

if (user) {
  initNav("admin");

  const nameInput = document.getElementById("admin-fullname");
  const usernameInput = document.getElementById("admin-username");
  const passInput = document.getElementById("admin-new-password");
  const form = document.getElementById("admin-profile-form");
  const saveBtn = document.getElementById("btn-save-admin-profile");

  if (nameInput) nameInput.value = user.fullName || "System Administrator";
  if (usernameInput) usernameInput.value = user.username || "admin";

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fullName = nameInput.value.trim();
    const username = usernameInput.value.trim().toLowerCase();
    const password = passInput.value.trim();

    if (!username || username.length < 3) {
      return showToast("Username must be at least 3 characters.", "error");
    }
    if (password && password.length < 6) {
      return showToast("New password must be at least 6 characters long.", "error");
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    try {
      const res = await apiCall("/api/auth?action=update-admin-profile", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          username,
          password: password || undefined,
        }),
      });

      showToast("Admin credentials updated successfully!", "success");
      passInput.value = "";
      if (res.user) {
        user.username = res.user.username;
        user.fullName = res.user.fullName;
        const metaName = document.querySelector(".sidebar-user-name");
        if (metaName) metaName.textContent = res.user.fullName;
      }
    } catch (err) {
      showToast(err.message || "Failed to update admin profile.", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Credentials";
    }
  });
}
