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
    status: paidAmount === amount ? ('PAID' as const) : ('PARTIAL' as const),
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
