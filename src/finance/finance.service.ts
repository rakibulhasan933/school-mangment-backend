import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  academicClasses,
  feeEventClasses,
  feeEvents,
  ledgerEntries,
  payments,
  receipts,
  salaryRecords,
  sections,
  studentFees,
  students,
  teachers,
  users,
} from '../db/schema.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  applyPayment,
  deriveFeeStatus,
  generateDues,
  ledgerTotals,
  nextReceiptNumber,
} from './money.js';
import {
  resolveOwnStudent,
  resolveOwnTeacher,
} from '../people/own-student.js';

@Injectable()
export class FinanceService {
  private readonly db = createDb();
  async events(schoolId: string) {
    const eventRows = await this.db
      .select()
      .from(feeEvents)
      .where(eq(feeEvents.schoolId, schoolId))
      .orderBy(asc(feeEvents.createdAt));
    const chargeRows = await this.db
      .select({
        feeEventId: feeEventClasses.feeEventId,
        classId: feeEventClasses.classId,
        amount: feeEventClasses.amount,
        classNameBn: academicClasses.nameBn,
      })
      .from(feeEventClasses)
      .innerJoin(
        academicClasses,
        eq(academicClasses.id, feeEventClasses.classId),
      );
    const feeRows = await this.db
      .select({
        feeEventId: studentFees.feeEventId,
        status: studentFees.status,
        amount: studentFees.amount,
        paidAmount: studentFees.paidAmount,
      })
      .from(studentFees)
      .where(eq(studentFees.schoolId, schoolId));
    return {
      data: eventRows.map((event) => {
        const own = feeRows.filter((row) => row.feeEventId === event.id);
        return {
          ...event,
          classes: chargeRows
            .filter((row) => row.feeEventId === event.id)
            .map((row) => ({
              classId: row.classId,
              classNameBn: row.classNameBn,
              amount: row.amount,
            })),
          duesCount: own.length,
          // B6: counts derive from amounts, never the stored status.
          paidCount: own.filter(
            (row) => deriveFeeStatus(row.amount, row.paidAmount) === 'PAID',
          ).length,
          partialCount: own.filter(
            (row) =>
              deriveFeeStatus(row.amount, row.paidAmount) === 'PARTIAL',
          ).length,
        };
      }),
    };
  }
  async dues(
    schoolId: string,
    filter: { classId?: string; sectionId?: string; status?: string } = {},
  ) {
    const rows = await this.db
      .select({
        fee: studentFees,
        student: students,
        studentNameBn: users.displayNameBn,
        registrationNumber: users.registrationNumber,
        classNameBn: academicClasses.nameBn,
        sectionNameBn: sections.nameBn,
        eventNameBn: feeEvents.nameBn,
      })
      .from(studentFees)
      .innerJoin(students, eq(students.id, studentFees.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .innerJoin(feeEvents, eq(feeEvents.id, studentFees.feeEventId))
      .leftJoin(academicClasses, eq(academicClasses.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .where(eq(studentFees.schoolId, schoolId))
      .orderBy(asc(studentFees.dueDate));
    return {
      data: rows
        .filter(
          ({ fee, student }) =>
            (!filter.classId || student.classId === filter.classId) &&
            (!filter.sectionId || student.sectionId === filter.sectionId) &&
            (!filter.status || fee.status === filter.status),
        )
        .map((row) => ({
          ...row.fee,
          // B6: the status the UI shows is always derived from amounts.
          status: deriveFeeStatus(row.fee.amount, row.fee.paidAmount),
          studentNameBn: row.studentNameBn,
          registrationNumber: row.registrationNumber,
          classNameBn: row.classNameBn,
          sectionNameBn: row.sectionNameBn,
          eventNameBn: row.eventNameBn,
        })),
    };
  }
  async createEvent(
    user: AuthUser,
    value: {
      nameBn: string;
      type: string;
      description?: string;
      dueDate: string;
      lateFee?: number;
      isPublished?: boolean;
      classes: Array<{ classId: string; amount: number }>;
    },
  ) {
    const [event] = await this.db
      .insert(feeEvents)
      .values({
        schoolId: user.schoolId,
        nameBn: value.nameBn,
        type: value.type,
        description: value.description ?? '',
        dueDate: value.dueDate,
        lateFee: value.lateFee ?? 0,
        isPublished: value.isPublished ?? false,
      })
      .returning();
    if (!event) throw new Error('ফি ইভেন্ট তৈরি করা যায়নি');
    await this.db
      .insert(feeEventClasses)
      .values(
        value.classes.map((item) => ({
          feeEventId: event.id,
          classId: item.classId,
          amount: item.amount,
        })),
      );
    if (event.isPublished)
      await this.generateDues(
        user.schoolId,
        event.id,
        value.classes,
        event.dueDate,
      );
    return { data: event };
  }
  private async generateDues(
    schoolId: string,
    feeEventId: string,
    charges: Array<{ classId: string; amount: number }>,
    dueDate: string,
  ) {
    const classStudents = await this.db
      .select({ studentId: students.id, classId: students.classId })
      .from(students)
      .where(eq(students.schoolId, schoolId));
    const dues = generateDues(
      classStudents.filter(
        (row): row is { studentId: string; classId: string } =>
          Boolean(row.classId),
      ),
      charges,
      dueDate,
    ).map((row) => ({ ...row, schoolId, feeEventId }));
    if (dues.length)
      await this.db.insert(studentFees).values(dues).onConflictDoNothing();
    return dues.length;
  }
  async publishEvent(user: AuthUser, eventId: string) {
    const [event] = await this.db
      .update(feeEvents)
      .set({ isPublished: true, updatedAt: new Date() })
      .where(
        and(eq(feeEvents.id, eventId), eq(feeEvents.schoolId, user.schoolId)),
      )
      .returning();
    if (!event) throw new NotFoundException('ফি ইভেন্ট পাওয়া যায়নি');
    const charges = await this.db
      .select({
        classId: feeEventClasses.classId,
        amount: feeEventClasses.amount,
      })
      .from(feeEventClasses)
      .where(eq(feeEventClasses.feeEventId, event.id));
    const count = await this.generateDues(
      user.schoolId,
      event.id,
      charges,
      event.dueDate,
    );
    return { data: event, generated: count };
  }
  async updateEvent(
    user: AuthUser,
    eventId: string,
    value: {
      nameBn?: string;
      type?: string;
      description?: string;
      dueDate?: string;
      lateFee?: number;
      isPublished?: boolean;
      classes?: Array<{ classId: string; amount: number }>;
    },
  ) {
    const [event] = await this.db
      .update(feeEvents)
      .set({
        ...(value.nameBn ? { nameBn: value.nameBn } : {}),
        ...(value.type ? { type: value.type } : {}),
        ...(value.description !== undefined
          ? { description: value.description }
          : {}),
        ...(value.dueDate ? { dueDate: value.dueDate } : {}),
        ...(value.lateFee !== undefined ? { lateFee: value.lateFee } : {}),
        ...(value.isPublished !== undefined
          ? { isPublished: value.isPublished }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(feeEvents.id, eventId), eq(feeEvents.schoolId, user.schoolId)),
      )
      .returning();
    if (!event) throw new NotFoundException('ফি ইভেন্ট পাওয়া যায়নি');
    if (value.classes) {
      await this.db
        .delete(feeEventClasses)
        .where(eq(feeEventClasses.feeEventId, eventId));
      await this.db
        .insert(feeEventClasses)
        .values(
          value.classes.map((item) => ({ feeEventId: eventId, ...item })),
        );
    }
    if (value.isPublished) {
      // Publishing through the edit form must generate dues just like the
      // dedicated publish action (insert is conflict-safe).
      const charges = await this.db
        .select({
          classId: feeEventClasses.classId,
          amount: feeEventClasses.amount,
        })
        .from(feeEventClasses)
        .where(eq(feeEventClasses.feeEventId, event.id));
      await this.generateDues(
        user.schoolId,
        event.id,
        charges,
        event.dueDate,
      );
    }
    return { data: event };
  }
  async copyEvent(user: AuthUser, eventId: string, dueDate?: string) {
    const [source] = await this.db
      .select()
      .from(feeEvents)
      .where(
        and(eq(feeEvents.id, eventId), eq(feeEvents.schoolId, user.schoolId)),
      )
      .limit(1);
    if (!source) throw new NotFoundException('ফি ইভেন্ট পাওয়া যায়নি');
    const charges = await this.db
      .select({
        classId: feeEventClasses.classId,
        amount: feeEventClasses.amount,
      })
      .from(feeEventClasses)
      .where(eq(feeEventClasses.feeEventId, eventId));
    return this.createEvent(user, {
      nameBn: `${source.nameBn} (পরবর্তী মাস)`,
      type: source.type,
      description: source.description,
      dueDate: dueDate ?? source.dueDate,
      lateFee: source.lateFee,
      isPublished: false,
      classes: charges,
    });
  }
  /**
   * B4: delete a fee event. Refused (400) as soon as any payment exists
   * against the event's dues — paid money must never lose its event.
   * Otherwise the event, its per-class charges and its (unpaid) student
   * assignments are removed together in one transaction.
   */
  async removeEvent(user: AuthUser, eventId: string) {
    const [event] = await this.db
      .select()
      .from(feeEvents)
      .where(
        and(eq(feeEvents.id, eventId), eq(feeEvents.schoolId, user.schoolId)),
      )
      .limit(1);
    if (!event) throw new NotFoundException('ফি ইভেন্ট পাওয়া যায়নি');
    const fees = await this.db
      .select({ id: studentFees.id })
      .from(studentFees)
      .where(eq(studentFees.feeEventId, eventId));
    if (fees.length) {
      const paymentRows = await this.db
        .select({ id: payments.id })
        .from(payments)
        .where(
          inArray(
            payments.studentFeeId,
            fees.map((row) => row.id),
          ),
        );
      if (paymentRows.length)
        throw new BadRequestException(
          'এই ফি ইভেন্টে পেমেন্ট জমা হয়েছে, তাই এটি মোছা যাবে না',
        );
    }
    await this.db.transaction(async (tx) => {
      await tx
        .delete(studentFees)
        .where(eq(studentFees.feeEventId, eventId));
      await tx
        .delete(feeEventClasses)
        .where(eq(feeEventClasses.feeEventId, eventId));
      await tx
        .delete(feeEvents)
        .where(
          and(
            eq(feeEvents.id, eventId),
            eq(feeEvents.schoolId, user.schoolId),
          ),
        );
    });
    return { data: { id: eventId, removedAssignments: fees.length } };
  }
  async pay(
    user: AuthUser,
    feeId: string,
    value: { amount: number; method: string; paidAt: string },
  ) {
    const [due] = await this.db
      .select()
      .from(studentFees)
      .where(
        and(eq(studentFees.id, feeId), eq(studentFees.schoolId, user.schoolId)),
      )
      .limit(1);
    if (!due) throw new NotFoundException('বকেয়া পাওয়া যায়নি');
    const update = applyPayment(due.amount - due.paidAmount, value.amount);
    const paidAmount = due.paidAmount + update.paidAmount;
    const [receipt] = await this.db
      .insert(receipts)
      .values({
        schoolId: user.schoolId,
        receiptNumber: nextReceiptNumber(
          (
            await this.db
              .select({ number: receipts.receiptNumber })
              .from(receipts)
              .where(eq(receipts.schoolId, user.schoolId))
          ).map((row) => row.number),
          new Date().getFullYear(),
        ),
        verifyCode: randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase(),
      })
      .returning();
    if (!receipt) throw new Error('রসিদ তৈরি করা যায়নি');
    await this.db
      .insert(payments)
      .values({
        schoolId: user.schoolId,
        studentFeeId: due.id,
        studentId: due.studentId,
        amount: value.amount,
        method: value.method,
        paidAt: value.paidAt,
        collectedBy: user.id,
        receiptId: receipt.id,
      });
    await this.db
      .update(studentFees)
      .set({
        paidAmount,
        status: deriveFeeStatus(due.amount, paidAmount),
        updatedAt: new Date(),
      })
      .where(eq(studentFees.id, due.id));
    await this.db
      .insert(ledgerEntries)
      .values({
        schoolId: user.schoolId,
        type: 'INCOME',
        amount: value.amount,
        entryDate: value.paidAt,
        description: `ফি পেমেন্ট ${receipt.receiptNumber}`,
        sourceType: 'PAYMENT',
        sourceId: receipt.id,
        createdBy: user.id,
      });
    return {
      data: { receipt, paidAmount, remaining: due.amount - paidAmount },
    };
  }
  async verify(receiptNumber: string, verifyCode: string) {
    const [row] = await this.db
      .select({ receipt: receipts, payment: payments, due: studentFees })
      .from(receipts)
      .innerJoin(payments, eq(payments.receiptId, receipts.id))
      .innerJoin(studentFees, eq(studentFees.id, payments.studentFeeId))
      .where(
        and(
          eq(receipts.receiptNumber, receiptNumber),
          eq(receipts.verifyCode, verifyCode),
        ),
      )
      .limit(1);
    return { valid: Boolean(row), data: row ?? null };
  }
  async ledger(schoolId: string, from?: string, to?: string) {
    const conditions = [
      eq(ledgerEntries.schoolId, schoolId),
      ...(from ? [gte(ledgerEntries.entryDate, from)] : []),
      ...(to ? [lte(ledgerEntries.entryDate, to)] : []),
    ];
    const entries = await this.db
      .select()
      .from(ledgerEntries)
      .where(and(...conditions));
    return {
      data: entries,
      totals: ledgerTotals(
        entries.map((entry) => ({
          type: entry.type as 'INCOME' | 'EXPENSE',
          amount: entry.amount,
        })),
      ),
    };
  }
  async salaries(schoolId: string) {
    const joined = await this.db
      .select({
        record: salaryRecords,
        teacherNameBn: users.displayNameBn,
        teacherCode: teachers.teacherCode,
      })
      .from(salaryRecords)
      .innerJoin(teachers, eq(teachers.id, salaryRecords.teacherId))
      .innerJoin(users, eq(users.id, teachers.userId))
      .where(eq(salaryRecords.schoolId, schoolId))
      .orderBy(asc(salaryRecords.salaryMonth));
    return {
      data: joined.map((row) => ({
        ...row.record,
        teacherNameBn: row.teacherNameBn,
        teacherCode: row.teacherCode,
      })),
    };
  }
  async studentDues(user: AuthUser) {
    // B1: resolve the student row by account id and use ITS school —
    // the token's schoolId can point at a school with no student record.
    const own = await resolveOwnStudent(this.db, user);
    if (!own) return { data: [] };
    const student = own.student;
    const schoolId = own.schoolId;
    // Join the fee event so the student portal can show the event name
    // instead of a bare fee row; remainingAmount is derived, never stored.
    const rows = await this.db
      .select({
        fee: studentFees,
        eventNameBn: feeEvents.nameBn,
        eventType: feeEvents.type,
        eventDescription: feeEvents.description,
      })
      .from(studentFees)
      .innerJoin(feeEvents, eq(feeEvents.id, studentFees.feeEventId))
      .where(
        and(
          eq(studentFees.schoolId, schoolId),
          eq(studentFees.studentId, student.id),
        ),
      )
      .orderBy(asc(studentFees.dueDate));
    return {
      data: rows.map((row) => ({
        ...row.fee,
        // B6: derived status, never the stored column.
        status: deriveFeeStatus(row.fee.amount, row.fee.paidAmount),
        eventNameBn: row.eventNameBn,
        eventType: row.eventType,
        eventDescription: row.eventDescription,
        remainingAmount: row.fee.amount - row.fee.paidAmount,
      })),
    };
  }
  async studentPayments(user: AuthUser) {
    const own = await resolveOwnStudent(this.db, user);
    if (!own) return { data: [] };
    const student = own.student;
    const schoolId = own.schoolId;
    // Join the receipt + fee event so the portal can render a real receipt
    // (receipt number / verify code / event name), newest payment first.
    const rows = await this.db
      .select({
        payment: payments,
        receiptNumber: receipts.receiptNumber,
        verifyCode: receipts.verifyCode,
        eventNameBn: feeEvents.nameBn,
      })
      .from(payments)
      .innerJoin(receipts, eq(receipts.id, payments.receiptId))
      .innerJoin(studentFees, eq(studentFees.id, payments.studentFeeId))
      .innerJoin(feeEvents, eq(feeEvents.id, studentFees.feeEventId))
      .where(
        and(
          eq(payments.schoolId, schoolId),
          eq(payments.studentId, student.id),
        ),
      )
      .orderBy(desc(payments.paidAt));
    return {
      data: rows.map((row) => ({
        ...row.payment,
        receiptNumber: row.receiptNumber,
        verifyCode: row.verifyCode,
        eventNameBn: row.eventNameBn,
      })),
    };
  }
  async studentStatement(user: AuthUser, studentId: string) {
    // ADMIN per-student fee statement (student-profile "ফি ও পেমেন্ট"
    // tab). The student row must belong to the caller's own school —
    // the :studentId param is never trusted on its own.
    const [student] = await this.db
      .select({ id: students.id })
      .from(students)
      .where(
        and(eq(students.id, studentId), eq(students.schoolId, user.schoolId)),
      )
      .limit(1);
    if (!student) throw new NotFoundException('শিক্ষার্থী পাওয়া যায়নি');
    const schoolId = user.schoolId;
    const feeRows = await this.db
      .select({
        fee: studentFees,
        eventNameBn: feeEvents.nameBn,
        eventType: feeEvents.type,
      })
      .from(studentFees)
      .innerJoin(feeEvents, eq(feeEvents.id, studentFees.feeEventId))
      .where(
        and(
          eq(studentFees.schoolId, schoolId),
          eq(studentFees.studentId, studentId),
        ),
      )
      .orderBy(asc(studentFees.dueDate));
    const paymentRows = await this.db
      .select({
        payment: payments,
        receiptNumber: receipts.receiptNumber,
        verifyCode: receipts.verifyCode,
        eventNameBn: feeEvents.nameBn,
        // Round 9: the receipt print needs the collector's display name,
        // not just the collectedBy user id stored on the payment row.
        collectedByName: users.displayNameBn,
      })
      .from(payments)
      .innerJoin(receipts, eq(receipts.id, payments.receiptId))
      .innerJoin(studentFees, eq(studentFees.id, payments.studentFeeId))
      .innerJoin(feeEvents, eq(feeEvents.id, studentFees.feeEventId))
      .leftJoin(users, eq(users.id, payments.collectedBy))
      .where(
        and(eq(payments.schoolId, schoolId), eq(payments.studentId, studentId)),
      )
      .orderBy(desc(payments.paidAt));
    const assignments = feeRows.map((row) => ({
      ...row.fee,
      // B6: derived status, never the stored column.
      status: deriveFeeStatus(row.fee.amount, row.fee.paidAmount),
      eventNameBn: row.eventNameBn,
      eventType: row.eventType,
      remainingAmount: row.fee.amount - row.fee.paidAmount,
    }));
    // Totals come from the assignments themselves so the summary cards
    // always reconcile with the table beneath them.
    const totalAmount = assignments.reduce((sum, row) => sum + row.amount, 0);
    const totalPaid = assignments.reduce(
      (sum, row) => sum + row.paidAmount,
      0,
    );
    return {
      data: {
        totals: { totalAmount, totalPaid, totalDue: totalAmount - totalPaid },
        assignments,
        payments: paymentRows.map((row) => ({
          ...row.payment,
          receiptNumber: row.receiptNumber,
          verifyCode: row.verifyCode,
          eventNameBn: row.eventNameBn,
          collectedByName: row.collectedByName ?? null,
        })),
      },
    };
  }
  async teacherSalaries(user: AuthUser) {
    const own = await resolveOwnTeacher(this.db, user);
    return {
      data: own
        ? await this.db
            .select()
            .from(salaryRecords)
            .where(
              and(
                eq(salaryRecords.schoolId, own.schoolId),
                eq(salaryRecords.teacherId, own.teacher.id),
              ),
            )
            .orderBy(asc(salaryRecords.salaryMonth))
        : [],
    };
  }
  async paySalary(
    user: AuthUser,
    value: {
      teacherId: string;
      salaryMonth: string;
      basic: number;
      allowances?: number;
      deductions?: number;
      method: string;
    },
  ) {
    const [already] = await this.db
      .select({ id: salaryRecords.id })
      .from(salaryRecords)
      .where(
        and(
          eq(salaryRecords.schoolId, user.schoolId),
          eq(salaryRecords.teacherId, value.teacherId),
          eq(salaryRecords.salaryMonth, value.salaryMonth),
        ),
      )
      .limit(1);
    if (already)
      throw new BadRequestException(
        'এই শিক্ষকের ওই মাসের বেতন ইতিমধ্যে পরিশোধ করা হয়েছে',
      );
    const net = value.basic + (value.allowances ?? 0) - (value.deductions ?? 0);
    // B5: the salary record and its আয়–ব্যয় ledger expense are written
    // in ONE transaction — a salary payment must never exist without its
    // ledger entry (the live ledger was missing real salary payments
    // because the two writes were not atomic / not always paired).
    const row = await this.db.transaction(async (tx) => {
      const [saved] = await tx
        .insert(salaryRecords)
        .values({
          schoolId: user.schoolId,
          teacherId: value.teacherId,
          salaryMonth: value.salaryMonth,
          basic: value.basic,
          allowances: value.allowances ?? 0,
          deductions: value.deductions ?? 0,
          net,
          status: 'PAID',
          paidAt: new Date().toISOString().slice(0, 10),
          method: value.method,
        })
        .returning();
      if (!saved) throw new Error('বেতন সংরক্ষণ করা যায়নি');
      await tx.insert(ledgerEntries).values({
        schoolId: user.schoolId,
        type: 'EXPENSE',
        amount: net,
        entryDate: saved.paidAt!,
        description: `বেতন ${value.salaryMonth}`,
        sourceType: 'SALARY',
        sourceId: saved.id,
        createdBy: user.id,
      });
      return saved;
    });
    return { data: row };
  }
  /** B5/B12: deleting a salary record also removes its ledger expense. */
  async removeSalary(user: AuthUser, id: string) {
    const [row] = await this.db
      .select()
      .from(salaryRecords)
      .where(
        and(
          eq(salaryRecords.id, id),
          eq(salaryRecords.schoolId, user.schoolId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException('বেতনের রেকর্ড পাওয়া যায়নি');
    await this.db.transaction(async (tx) => {
      await tx
        .delete(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.schoolId, user.schoolId),
            eq(ledgerEntries.sourceType, 'SALARY'),
            eq(ledgerEntries.sourceId, id),
          ),
        );
      await tx
        .delete(salaryRecords)
        .where(
          and(
            eq(salaryRecords.id, id),
            eq(salaryRecords.schoolId, user.schoolId),
          ),
        );
    });
    return { data: { id } };
  }
  /**
   * B12: delete one fee payment and roll everything it touched back in a
   * single transaction — the due's paidAmount/status is recomputed, the
   * receipt is removed, and the auto-posted ledger income is removed.
   */
  async removePayment(user: AuthUser, paymentId: string) {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(
        and(eq(payments.id, paymentId), eq(payments.schoolId, user.schoolId)),
      )
      .limit(1);
    if (!payment) throw new NotFoundException('পেমেন্ট পাওয়া যায়নি');
    const [due] = await this.db
      .select()
      .from(studentFees)
      .where(eq(studentFees.id, payment.studentFeeId))
      .limit(1);
    await this.db.transaction(async (tx) => {
      await tx.delete(payments).where(eq(payments.id, paymentId));
      await tx
        .delete(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.schoolId, user.schoolId),
            eq(ledgerEntries.sourceType, 'PAYMENT'),
            eq(ledgerEntries.sourceId, payment.receiptId),
          ),
        );
      await tx.delete(receipts).where(eq(receipts.id, payment.receiptId));
      if (due) {
        const paidAmount = Math.max(due.paidAmount - payment.amount, 0);
        await tx
          .update(studentFees)
          .set({
            paidAmount,
            status: deriveFeeStatus(due.amount, paidAmount),
            updatedAt: new Date(),
          })
          .where(eq(studentFees.id, due.id));
      }
    });
    return { data: { id: paymentId } };
  }
  /**
   * B12: manual ledger entries can be deleted; system-generated entries
   * (fee payments, salary) are refused — delete them from their source
   * screen so the books stay consistent.
   */
  async removeLedgerEntry(user: AuthUser, id: string) {
    const [entry] = await this.db
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.id, id),
          eq(ledgerEntries.schoolId, user.schoolId),
        ),
      )
      .limit(1);
    if (!entry) throw new NotFoundException('লেজার এন্ট্রি পাওয়া যায়নি');
    if (entry.sourceType === 'PAYMENT' || entry.sourceType === 'SALARY')
      throw new BadRequestException(
        'স্বয়ংক্রিয় লেজার এন্ট্রি এখান থেকে মোছা যাবে না — সংশ্লিষ্ট পেমেন্ট/বেতন রেকর্ড মুছুন',
      );
    await this.db
      .delete(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.id, id),
          eq(ledgerEntries.schoolId, user.schoolId),
        ),
      );
    return { data: { id } };
  }
}
