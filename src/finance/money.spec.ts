import { describe, expect, it } from 'vitest';
import {
  applyPayment,
  deriveFeeStatus,
  generateDues,
  ledgerTotals,
  nextReceiptNumber,
} from './money.js';

describe('deriveFeeStatus (B6)', () => {
  it('paid 500 of 600 is PARTIAL, never PAID', () => {
    expect(deriveFeeStatus(60000, 50000)).toBe('PARTIAL');
  });
  it('paid nothing is DUE', () => {
    expect(deriveFeeStatus(60000, 0)).toBe('DUE');
  });
  it('paid in full is PAID', () => {
    expect(deriveFeeStatus(60000, 60000)).toBe('PAID');
  });
  it('overpaid is PAID', () => {
    expect(deriveFeeStatus(60000, 65000)).toBe('PAID');
  });
  it('one paisa short is PARTIAL', () => {
    expect(deriveFeeStatus(60000, 59999)).toBe('PARTIAL');
  });
});

describe('Sprint 5 money rules', () => {
  it('generates dues only for selected classes using each class amount', () => {
    expect(
      generateDues(
        [
          { studentId: 'a', classId: '6' },
          { studentId: 'b', classId: '7' },
          { studentId: 'c', classId: '8' },
        ],
        [
          { classId: '6', amount: 500 },
          { classId: '8', amount: 700 },
        ],
        '2026-11-10',
      ),
    ).toEqual([
      {
        studentId: 'a',
        classId: '6',
        amount: 500,
        paidAmount: 0,
        dueDate: '2026-11-10',
        status: 'DUE',
      },
      {
        studentId: 'c',
        classId: '8',
        amount: 700,
        paidAmount: 0,
        dueDate: '2026-11-10',
        status: 'DUE',
      },
    ]);
  });
  it('leaves the correct balance after a partial payment', () =>
    expect(applyPayment(1000, 350)).toEqual({
      paidAmount: 350,
      remaining: 650,
      status: 'PARTIAL',
    }));
  it('creates sequential unique receipt numbers', () =>
    expect(nextReceiptNumber(['RC-2026-000001', 'RC-2026-000004'], 2026)).toBe(
      'RC-2026-000005',
    ));
  it('totals ledger postings', () =>
    expect(
      ledgerTotals([
        { type: 'INCOME', amount: 1000 },
        { type: 'EXPENSE', amount: 300 },
        { type: 'INCOME', amount: 250 },
      ]),
    ).toEqual({ income: 1250, expense: 300, balance: 950 }));
});
