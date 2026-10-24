import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { makeFakeDb, type FakeRow } from '../testing/fake-db.js';

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../db/index.js', () => ({
  createDb: () => holder.current,
}));

import { FinanceService } from './finance.service.js';
import type { AuthUser } from '../auth/auth.types.js';

const admin = {
  id: 'admin-1',
  schoolId: 'school-1',
  role: 'ADMIN',
  displayNameBn: 'প্রশাসক',
} as AuthUser;

function setup(seed: Record<string, FakeRow[]>) {
  const fake = makeFakeDb(seed);
  holder.current = fake.db;
  return { service: new FinanceService(), fake };
}

describe('FinanceService.paySalary (B5)', () => {
  it('posts exactly one ledger EXPENSE for the payment, linked by sourceId', async () => {
    const { service, fake } = setup({ salary_records: [] });
    const { data } = await service.paySalary(admin, {
      teacherId: 'teacher-1',
      salaryMonth: '2026-10',
      basic: 2500000,
      allowances: 200000,
      deductions: 50000,
      method: 'ব্যাংক',
    });
    expect(data.net).toBe(2650000);
    const ledgerInsert = fake.inserted.find(
      (row) => row.table === 'ledger_entries',
    );
    expect(ledgerInsert).toBeDefined();
    expect(ledgerInsert!.values).toMatchObject({
      type: 'EXPENSE',
      amount: 2650000,
      sourceType: 'SALARY',
      sourceId: data.id,
      entryDate: data.paidAt,
    });
  });

  it('refuses a second payment for the same teacher + month', async () => {
    const { service } = setup({ salary_records: [{ id: 'sal-1' }] });
    await expect(
      service.paySalary(admin, {
        teacherId: 'teacher-1',
        salaryMonth: '2026-10',
        basic: 100,
        method: 'ক্যাশ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('FinanceService.removeSalary (B5/B12)', () => {
  it('removes the ledger expense together with the salary record', async () => {
    const { service, fake } = setup({
      salary_records: [{ id: 'sal-1', schoolId: 'school-1' }],
    });
    await service.removeSalary(admin, 'sal-1');
    expect(fake.deleted).toEqual(['ledger_entries', 'salary_records']);
  });
});

describe('FinanceService.removeEvent (B4)', () => {
  it('deletes the event, its class charges and unpaid assignments when no payments exist', async () => {
    const { service, fake } = setup({
      fee_events: [{ id: 'ev-1', schoolId: 'school-1' }],
      student_fees: [{ id: 'fee-1' }, { id: 'fee-2' }],
      payments: [],
    });
    const result = await service.removeEvent(admin, 'ev-1');
    expect(result.data.removedAssignments).toBe(2);
    expect(fake.deleted).toEqual([
      'student_fees',
      'fee_event_classes',
      'fee_events',
    ]);
  });

  it('refuses with 400 when any payment exists for the event', async () => {
    const { service, fake } = setup({
      fee_events: [{ id: 'ev-1', schoolId: 'school-1' }],
      student_fees: [{ id: 'fee-1' }],
      payments: [{ id: 'pay-1' }],
    });
    await expect(service.removeEvent(admin, 'ev-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fake.deleted).toEqual([]);
  });
});

describe('FinanceService.removeLedgerEntry (B12)', () => {
  it('refuses system-generated SALARY entries', async () => {
    const { service } = setup({
      ledger_entries: [{ id: 'le-1', sourceType: 'SALARY' }],
    });
    await expect(
      service.removeLedgerEntry(admin, 'le-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes manual entries', async () => {
    const { service, fake } = setup({
      ledger_entries: [{ id: 'le-2', sourceType: null }],
    });
    await service.removeLedgerEntry(admin, 'le-2');
    expect(fake.deleted).toEqual(['ledger_entries']);
  });
});

describe('FinanceService.dues (B6)', () => {
  it('derives PARTIAL for a stored-PAID row that is 500 of 600 paid', async () => {
    const { service } = setup({
      // dues() issues one joined select from student_fees; the fake
      // returns rows in the joined shape the service maps over.
      student_fees: [
        {
          fee: {
            id: 'fee-1',
            amount: 60000,
            paidAmount: 50000,
            status: 'PAID',
            dueDate: '2026-10-10',
          },
          student: { id: 'st-1', classId: 'cls-6', sectionId: null },
          studentNameBn: 'আরিফ হোসেন',
          registrationNumber: '26060122',
          classNameBn: 'শ্রেণি ৬',
          sectionNameBn: null,
          eventNameBn: 'মাসিক বেতন',
        },
      ],
    });
    const { data } = await service.dues('school-1');
    expect(data[0]?.status).toBe('PARTIAL');
  });
});

describe('FinanceService.studentStatement (Round 8 fee tab)', () => {
  it('returns derived statuses, receipt-bearing payments and reconciling totals', async () => {
    const { service } = setup({
      students: [{ id: 'st-1', schoolId: 'school-1' }],
      // Joined shapes, as in the dues spec: { fee, eventNameBn, ... }.
      student_fees: [
        {
          fee: {
            id: 'fee-1',
            studentId: 'st-1',
            amount: 60000,
            paidAmount: 50000,
            status: 'PAID',
            dueDate: '2026-10-10',
          },
          eventNameBn: 'অক্টোবর মাসের বেতন',
          eventType: 'MONTHLY',
        },
        {
          fee: {
            id: 'fee-2',
            studentId: 'st-1',
            amount: 30000,
            paidAmount: 30000,
            status: 'PAID',
            dueDate: '2026-09-10',
          },
          eventNameBn: 'পরীক্ষার ফি',
          eventType: 'EXAM',
        },
      ],
      payments: [
        {
          payment: {
            id: 'pay-1',
            studentId: 'st-1',
            amount: 50000,
            method: 'ক্যাশ',
            paidAt: '2026-10-05',
          },
          receiptNumber: 'RC-2026-000007',
          verifyCode: 'VC-7',
          eventNameBn: 'অক্টোবর মাসের বেতন',
        },
        {
          payment: {
            id: 'pay-2',
            studentId: 'st-1',
            amount: 30000,
            method: 'বিকাশ',
            paidAt: '2026-09-08',
          },
          receiptNumber: 'RC-2026-000003',
          verifyCode: 'VC-3',
          eventNameBn: 'পরীক্ষার ফি',
        },
      ],
    });
    const { data } = await service.studentStatement(admin, 'st-1');
    expect(data.totals).toEqual({
      totalAmount: 90000,
      totalPaid: 80000,
      totalDue: 10000,
    });
    // The stored 'PAID' on the 500-of-600 row must surface as PARTIAL.
    expect(data.assignments.map((row) => row.status)).toEqual([
      'PARTIAL',
      'PAID',
    ]);
    expect(data.assignments[0]?.remainingAmount).toBe(10000);
    expect(data.payments.map((row) => row.receiptNumber)).toEqual([
      'RC-2026-000007',
      'RC-2026-000003',
    ]);
  });

  it('surfaces the collector display name on payments for receipt printing', async () => {
    const { service } = setup({
      students: [{ id: 'st-1', schoolId: 'school-1' }],
      student_fees: [],
      payments: [
        {
          payment: {
            id: 'pay-1',
            studentId: 'st-1',
            amount: 50000,
            method: 'ক্যাশ',
            paidAt: '2026-10-05',
          },
          receiptNumber: 'RC-2026-000007',
          verifyCode: 'VC-7',
          eventNameBn: 'অক্টোবর মাসের বেতন',
          collectedByName: 'প্রশাসক',
        },
      ],
    });
    const { data } = await service.studentStatement(admin, 'st-1');
    expect(data.payments[0]?.collectedByName).toBe('প্রশাসক');
  });

  it('returns zero totals and empty lists for a student with no fees', async () => {
    const { service } = setup({
      students: [{ id: 'st-2', schoolId: 'school-1' }],
      student_fees: [],
      payments: [],
    });
    const { data } = await service.studentStatement(admin, 'st-2');
    expect(data.totals).toEqual({ totalAmount: 0, totalPaid: 0, totalDue: 0 });
    expect(data.assignments).toEqual([]);
    expect(data.payments).toEqual([]);
  });

  it('throws NotFound when the student is not in the caller school', async () => {
    const { service } = setup({ students: [] });
    await expect(
      service.studentStatement(admin, 'st-other-school'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
