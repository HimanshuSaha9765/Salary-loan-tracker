import { query } from "./db.js";

export async function getActiveLoans(employeeId) {
  return query(
    `SELECT id, loan_type, loan_amount, remaining_amount, loan_date, created_at
     FROM loans
     WHERE employee_id = $1
       AND is_deleted = false
       AND status = 'active'
       AND remaining_amount > 0
     ORDER BY
       CASE WHEN loan_type = 'pre_system' THEN 0 ELSE 1 END,
       COALESCE(loan_date, created_at::date) ASC,
       id ASC`,
    [employeeId],
  );
}

export function calculateFIFO(loans, repaymentAmount) {
  let remainingPayment = Number(repaymentAmount);
  const allocations = [];

  for (const loan of loans) {
    if (remainingPayment <= 0) {
      break;
    }

    const before = Number(loan.remaining_amount);
    const applied = Math.min(before, remainingPayment);
    const after = before - applied;

    allocations.push({
      loanId: loan.id,
      amountApplied: applied,
      loanRemainingBefore: before,
      loanRemainingAfter: after,
    });

    remainingPayment -= applied;
  }

  return { allocations, unappliedAmount: remainingPayment };
}
