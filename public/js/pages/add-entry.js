import {
  apiCall,
  formatDate,
  formatINR,
  formatShortDateIST,
  getTodayDate,
  requireAuth,
} from "../app.js";
import { initNav } from "../nav.js";
import { showToast } from "../toast.js";

const user = await requireAuth();
let type = "salary_given";
let activeLoans = [];

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
  initNav("add-entry");
  
  const todayIso = getTodayDate();
  const dateInput = document.getElementById("entry-date");
  const datePicker = document.getElementById("entry-date-picker");
  const calendarBtn = document.getElementById("open-calendar-btn");

  if (dateInput) {
    dateInput.value = formatDate(todayIso);
    if (datePicker) datePicker.value = todayIso;

    calendarBtn?.addEventListener("click", () => {
      try {
        if (typeof datePicker.showPicker === "function") {
          datePicker.showPicker();
        } else {
          datePicker.focus();
          datePicker.click();
        }
      } catch {
        datePicker.focus();
      }
    });

    datePicker?.addEventListener("change", () => {
      if (datePicker.value) {
        dateInput.value = formatDate(datePicker.value);
      }
    });

    dateInput.addEventListener("input", () => {
      let val = dateInput.value.replace(/[^\d\/]/g, "");
      if (val.length === 2 && !val.includes("/")) {
        val = val + "/";
      } else if (val.length === 5 && (val.match(/\//g) || []).length === 1) {
        val = val + "/";
      }
      dateInput.value = val;
    });
  }

  const employees = await apiCall("/api/employees?limit=30");
  document.getElementById("entry-employee").innerHTML =
    '<option value="">Select employee</option>' +
    employees.employees
      .map(
        (row) =>
          `<option value="${row.id}">${row.full_name} · ${row.emp_code} · ${formatINR(row.outstanding)}</option>`,
      )
      .join("");
  document
    .getElementById("entry-employee")
    .addEventListener("change", loadLoans);
  document
    .getElementById("repayment-mode")
    .addEventListener("change", renderSpecificLoans);
  document
    .querySelectorAll(".entry-type")
    .forEach((button) =>
      button.addEventListener("click", () => selectType(button.dataset.type)),
    );
  selectType(type);
  document.getElementById("entry-form").addEventListener("submit", save);
}
function selectType(value) {
  type = value;
  document.querySelectorAll(".entry-type").forEach((button) => {
    button.classList.toggle("btn-primary", button.dataset.type === type);
    button.classList.toggle("btn-secondary", button.dataset.type !== type);
  });
  document.getElementById("repayment-mode").disabled = type !== "repayment";
  renderSpecificLoans();
}
async function loadLoans() {
  const employeeId = document.getElementById("entry-employee").value;
  activeLoans = employeeId
    ? (await apiCall(`/api/loans?employeeId=${employeeId}&status=active`)).loans
    : [];
  renderSpecificLoans();
}
function renderSpecificLoans() {
  document.getElementById("specific-loan-wrap")?.remove();
  if (
    type !== "repayment" ||
    document.getElementById("repayment-mode").value !== "specific"
  )
    return;
  const wrap = document.createElement("div");
  wrap.className = "form-group";
  wrap.id = "specific-loan-wrap";
  wrap.innerHTML = `<label class="form-label" for="specific-loan">Specific Loan</label><select class="select" id="specific-loan" required><option value="">Select active loan</option>${activeLoans.map((loan) => `<option value="${loan.id}">${loan.loan_type === "pre_system" ? "Before System" : "Regular"} · ${formatShortDateIST(loan.loan_date || loan.created_at)} · ${formatINR(loan.remaining_amount)} remaining</option>`).join("")}</select>`;
  document.getElementById("repayment-mode").closest(".form-group").after(wrap);
}
async function save(event) {
  event.preventDefault();
  const button = event.submitter;
  const rawDate = document.getElementById("entry-date").value;
  const isoDate = toISODate(rawDate);
  if (!isoDate) {
    showToast("Please select or enter a valid date.", "error");
    return;
  }

  const amountVal = Number(document.getElementById("entry-amount").value);
  if (!amountVal || amountVal <= 0) {
    showToast("Please enter a valid positive amount.", "error");
    return;
  }

  if (type === "repayment") {
    const mode = document.getElementById("repayment-mode").value;
    const totalRemaining = activeLoans.reduce(
      (sum, l) => sum + Number(l.remaining_amount || 0),
      0,
    );

    if (activeLoans.length === 0 || totalRemaining <= 0) {
      showToast("No active loan balance exists for this employee.", "error");
      return;
    }

    if (amountVal > totalRemaining) {
      showToast(
        `Repayment amount (${formatINR(amountVal)}) exceeds total outstanding loan balance (${formatINR(totalRemaining)}).`,
        "error",
      );
      return;
    }

    if (mode === "specific") {
      const specificId = document.getElementById("specific-loan")?.value;
      const targetLoan = activeLoans.find(
        (l) => Number(l.id) === Number(specificId),
      );
      if (!targetLoan) {
        showToast("Please select an active loan for specific repayment.", "error");
        return;
      }
    }
  }

  button.disabled = true;
  button.textContent = "Saving entry…";
  try {
    await apiCall("/api/entries", {
      method: "POST",
      body: JSON.stringify({
        employeeId: document.getElementById("entry-employee").value,
        entryDate: isoDate,
        entryType: type,
        amount: document.getElementById("entry-amount").value,
        repaymentMode: document.getElementById("repayment-mode").value,
        specificLoanId: document.getElementById("specific-loan")?.value || null,
        remarks: document.getElementById("entry-remarks").value,
      }),
    });
    showToast(
      "Entry recorded successfully. You may add another entry when ready.",
      "success",
    );
    document.getElementById("entry-amount").value = "";
    document.getElementById("entry-remarks").value = "";
    await loadLoans();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Save Entry";
  }
}
