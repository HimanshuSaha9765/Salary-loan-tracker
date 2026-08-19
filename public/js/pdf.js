import { formatDate, formatINR } from "./app.js";

function printDocument(title, content) {
  const popup = window.open("", "_blank");
  if (!popup) {
    throw new Error(
      "Please allow pop-ups in your browser to export this report.",
    );
  }
  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @page {
      margin: 12mm 15mm;
      size: A4 portrait;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      padding: 24px;
      margin: 0 auto;
      max-width: 900px;
      line-height: 1.5;
    }
    .report-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding-bottom: 20px;
      border-bottom: 2px solid #0f766e;
      margin-bottom: 22px;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-logo {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      object-fit: cover;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 6px rgba(15, 118, 110, 0.08);
    }
    .report-title {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.02em;
      margin: 0;
    }
    .report-subtitle {
      margin: 2px 0 0;
      color: #64748b;
      font-size: 12px;
      font-weight: 500;
    }
    .report-meta {
      text-align: right;
      font-size: 11.5px;
      color: #475569;
    }
    .meta-pill {
      display: inline-block;
      padding: 3px 9px;
      border-radius: 12px;
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .summary-card {
      padding: 12px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
    }
    .summary-label {
      font-size: 10.5px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
    }
    .summary-val {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
    }
    .summary-val.success { color: #16a34a; }
    .summary-val.danger { color: #dc2626; }
    .summary-val.primary { color: #0f766e; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 12px;
    }
    thead th {
      padding: 10px 12px;
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1.5px solid #cbd5e1;
      text-align: left;
    }
    thead th.amount-col, thead th.balance-col {
      text-align: right;
    }
    tbody td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
      color: #1e293b;
    }
    tbody tr:nth-child(even) {
      background: #fafafa;
    }
    .emp-name {
      font-weight: 600;
      color: #0f172a;
    }
    .type-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.01em;
    }
    .badge-salary { background: #e0f2fe; color: #0369a1; }
    .badge-loan { background: #fee2e2; color: #b91c1c; }
    .badge-repayment { background: #dcfce7; color: #15803d; }
    .amount-val {
      text-align: right;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .balance-val {
      text-align: right;
      font-weight: 700;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
    }
    .balance-val.cleared {
      color: #64748b;
      font-weight: 500;
    }
    .report-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 28px;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      color: #64748b;
      font-size: 11px;
    }
    @media print {
      body {
        padding: 0;
        max-width: 100%;
      }
      tr {
        page-break-inside: avoid;
      }
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`);
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 400);
}

function formatTypeLabel(type) {
  if (type === "salary_given") return { text: "Salary", class: "badge-salary" };
  if (type === "loan_given") return { text: "Loan Given", class: "badge-loan" };
  if (type === "repayment") return { text: "Loan Repayment", class: "badge-repayment" };
  return {
    text: String(type || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase()),
    class: "badge-salary",
  };
}

export function exportEntriesReport(entries) {
  if (!entries || !entries.length) {
    throw new Error("There are no entries to export with the current filters.");
  }

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

  // Calculate Running Loan Balances chronologically per employee
  const employeeBalances = {};
  const chronological = [...entries].sort(
    (a, b) =>
      new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime() ||
      Number(a.id) - Number(b.id),
  );

  const balanceMap = new Map();
  let totalSalary = 0;
  let totalLoans = 0;
  let totalRepayments = 0;

  for (const entry of chronological) {
    const empKey = entry.employee_id || entry.employee_name || "all";
    if (employeeBalances[empKey] === undefined) {
      employeeBalances[empKey] = 0;
    }
    const amt = Number(entry.amount) || 0;
    if (entry.entry_type === "loan_given") {
      employeeBalances[empKey] += amt;
      totalLoans += amt;
    } else if (entry.entry_type === "repayment") {
      employeeBalances[empKey] = Math.max(0, employeeBalances[empKey] - amt);
      totalRepayments += amt;
    } else if (entry.entry_type === "salary_given") {
      totalSalary += amt;
    }
    balanceMap.set(entry.id, employeeBalances[empKey]);
  }

  const rowsHtml = chronological
    .map((entry) => {
      const typeInfo = formatTypeLabel(entry.entry_type);
      const balance = balanceMap.get(entry.id) ?? 0;
      const isRepaymentOrLoan =
        entry.entry_type === "loan_given" || entry.entry_type === "repayment";
      return `<tr>
        <td>${formatDate(entry.entry_date)}</td>
        <td class="emp-name">${entry.employee_name || "—"}</td>
        <td><span class="type-badge ${typeInfo.class}">${typeInfo.text}</span></td>
        <td class="amount-val">${formatINR(entry.amount)}</td>
        <td class="balance-val ${balance === 0 ? "cleared" : ""}">${isRepaymentOrLoan || balance > 0 ? formatINR(balance) : "₹0.00"}</td>
      </tr>`;
    })
    .join("");

  const content = `
    <header class="report-header">
      <div class="brand-group">
        <img src="${logoUrl}" alt="Company Logo" class="brand-logo" onerror="this.style.display='none'">
        <div>
          <h1 class="report-title">Salary & Loan Tracker</h1>
          <p class="report-subtitle">Official Transactions & Loan Ledger Report</p>
        </div>
      </div>
      <div class="report-meta">
        <span class="meta-pill">Official Ledger</span>
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
          <th style="width: 32%">Employee</th>
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
      <span>Generated via Salary & Loan Tracker Portal</span>
      <span>${generatedAt} IST</span>
    </footer>
  `;

  printDocument("Financial Entries Report", content);
}

export function exportEmployeeStatement(employee, loans = [], entries = []) {
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

  const totalLoans = loans.reduce((s, l) => s + Number(l.loan_amount || 0), 0);
  const outstanding = loans.reduce((s, l) => s + Number(l.remaining_amount || 0), 0);
  const repaid = totalLoans - outstanding;

  const loanRows = loans
    .map(
      (loan) =>
        `<tr>
          <td>${loan.loan_type === "pre_system" ? "Before System" : "Regular Loan"}</td>
          <td>${loan.loan_type === "pre_system" ? "Before System" : formatDate(loan.loan_date || loan.created_at)}</td>
          <td class="amount-val">${formatINR(loan.loan_amount)}</td>
          <td class="amount-val ${Number(loan.remaining_amount) > 0 ? "danger" : ""}">${formatINR(loan.remaining_amount)}</td>
          <td><span class="type-badge ${loan.status === "active" ? "badge-loan" : "badge-repayment"}">${loan.status === "active" ? "Active" : "Paid"}</span></td>
        </tr>`,
    )
    .join("") || `<tr><td colspan="5" style="text-align:center;color:#64748b">No loans recorded.</td></tr>`;

  // Calculate Running Loan Balance for this employee
  let currentBal = 0;
  const chronological = [...entries].sort(
    (a, b) =>
      new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime() ||
      Number(a.id) - Number(b.id),
  );
  const balanceMap = new Map();
  for (const entry of chronological) {
    const amt = Number(entry.amount) || 0;
    if (entry.entry_type === "loan_given") {
      currentBal += amt;
    } else if (entry.entry_type === "repayment") {
      currentBal = Math.max(0, currentBal - amt);
    }
    balanceMap.set(entry.id, currentBal);
  }

  const entryRows = entries
    .map((entry) => {
      const typeInfo = formatTypeLabel(entry.entry_type);
      const bal = balanceMap.get(entry.id) ?? 0;
      return `<tr>
        <td>${formatDate(entry.entry_date)}</td>
        <td><span class="type-badge ${typeInfo.class}">${typeInfo.text}</span></td>
        <td class="amount-val">${formatINR(entry.amount)}</td>
        <td class="balance-val ${bal === 0 ? "cleared" : ""}">${formatINR(bal)}</td>
      </tr>`;
    })
    .join("") || `<tr><td colspan="4" style="text-align:center;color:#64748b">No transactions recorded.</td></tr>`;

  const content = `
    <header class="report-header">
      <div class="brand-group">
        <img src="${logoUrl}" alt="Company Logo" class="brand-logo" onerror="this.style.display='none'">
        <div>
          <h1 class="report-title">Employee Account Statement</h1>
          <p class="report-subtitle">${employee.full_name} · ${employee.emp_code || ""}</p>
        </div>
      </div>
      <div class="report-meta">
        <span class="meta-pill">${employee.designation || "Employee"}</span>
        <div>Status: <strong>${employee.is_active ? "Active" : "Inactive"}</strong></div>
      </div>
    </header>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Outstanding Balance</div>
        <div class="summary-val danger">${formatINR(outstanding)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Total Loans Issued</div>
        <div class="summary-val">${formatINR(totalLoans)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Total Repaid</div>
        <div class="summary-val success">${formatINR(repaid)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Active Loans</div>
        <div class="summary-val primary">${loans.filter((l) => l.status === "active").length}</div>
      </div>
    </div>

    <h2 style="font-size:14px;font-weight:700;color:#0f172a;margin:22px 0 8px;text-transform:uppercase;letter-spacing:0.04em">Loan Records</h2>
    <table>
      <thead>
        <tr>
          <th>Loan Type</th>
          <th>Issue Date</th>
          <th class="amount-col">Loan Amount</th>
          <th class="balance-col">Remaining</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${loanRows}
      </tbody>
    </table>

    <h2 style="font-size:14px;font-weight:700;color:#0f172a;margin:24px 0 8px;text-transform:uppercase;letter-spacing:0.04em">Transaction History</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 25%">Date</th>
          <th style="width: 25%">Transaction Type</th>
          <th class="amount-col" style="width: 25%">Amount</th>
          <th class="balance-col" style="width: 25%">Loan Balance</th>
        </tr>
      </thead>
      <tbody>
        ${entryRows}
      </tbody>
    </table>

    <footer class="report-footer">
      <span>Generated via Salary & Loan Tracker Portal</span>
      <span>${generatedAt} IST</span>
    </footer>
  `;

  printDocument(`Statement - ${employee.full_name}`, content);
}
