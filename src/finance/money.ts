export type StudentClass = { studentId: string; classId: string };
export type ClassCharge = { classId: string; amount: number };

export function generateDues(
  students: StudentClass[],
  charges: ClassCharge[],
  dueDate: string,
) {
  const amounts = new Map(
    charges.map((charge) => [charge.classId, charge.amount]),
  );
  return students
    .filter((student) => amounts.has(student.classId))
    .map((student) => ({
      studentId: student.studentId,
      classId: student.classId,
      amount: amounts.get(student.classId)!,
      paidAmount: 0,
      dueDate,
      status: 'DUE' as const,
    }));
}

export type FeeStatus = 'DUE' | 'PARTIAL' | 'PAID';

/**
 * The one canonical fee-status derivation (Round 6, B6). Every read path
 * (collection list, fee-event counts, student portal, reports) must derive
 * the status from the amounts with this function instead of trusting the
 * stored status column, which older writes could leave stale — a student
 * who paid 500 of 600 was displayed as fully paid (পরিশোধিত).
 *   paid <= 0        -> DUE
 *   0 < paid < due   -> PARTIAL
 *   paid >= due      -> PAID
 */
export function deriveFeeStatus(amount: number, paidAmount: number): FeeStatus {
  if (!Number.isFinite(amount) || !Number.isFinite(paidAmount)) return 'DUE';
  if (paidAmount <= 0) return 'DUE';
  if (paidAmount >= amount) return 'PAID';
  return 'PARTIAL';
}

export function applyPayment(amount: number, payment: number) {
  if (
    !Number.isInteger(amount) ||
    !Number.isInteger(payment) ||
    amount < 0 ||
    payment <= 0 ||
    payment > amount
  )
    throw new Error('অবৈধ পেমেন্ট পরিমাণ');
  const paidAmount = payment;
  return {
    paidAmount,
    remaining: amount - paidAmount,
    status: deriveFeeStatus(amount, paidAmount),
  };
}

export function nextReceiptNumber(existing: string[], year: number) {
  const prefix = `RC-${year}-`;
  const sequence = existing
    .filter((value) => value.startsWith(prefix))
    .map((value) => Number(value.slice(prefix.length)))
    .filter(Number.isInteger);
  return `${prefix}${String(Math.max(0, ...sequence) + 1).padStart(6, '0')}`;
}

export function ledgerTotals(
  entries: Array<{ type: 'INCOME' | 'EXPENSE'; amount: number }>,
) {
  const income = entries
    .filter((entry) => entry.type === 'INCOME')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const expense = entries
    .filter((entry) => entry.type === 'EXPENSE')
    .reduce((sum, entry) => sum + entry.amount, 0);
  return { income, expense, balance: income - expense };
}
