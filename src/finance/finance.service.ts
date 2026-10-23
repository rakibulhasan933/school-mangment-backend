import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
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
  generateDues,
  ledgerTotals,
  nextReceiptNumber,
} from './money.js';

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
          paidCount: own.filter((row) => row.status === 'PAID').length,
          partialCount: own.filter((row) => row.status === 'PARTIAL').length,
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
        status: paidAmount === due.amount ? 'PAID' : 'PARTIAL',
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
    const [student] = await this.db
      .select({ id: students.id })
      .from(students)
      .where(
        and(eq(students.schoolId, user.schoolId), eq(students.userId, user.id)),
      )
      .limit(1);
    if (!student) return { data: [] };
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
          eq(studentFees.schoolId, user.schoolId),
          eq(studentFees.studentId, student.id),
        ),
      )
      .orderBy(asc(studentFees.dueDate));
    return {
      data: rows.map((row) => ({
        ...row.fee,
        eventNameBn: row.eventNameBn,
        eventType: row.eventType,
        eventDescription: row.eventDescription,
        remainingAmount: row.fee.amount - row.fee.paidAmount,
      })),
    };
  }
  async studentPayments(user: AuthUser) {
    const [student] = await this.db
      .select({ id: students.id })
      .from(students)
      .where(
        and(eq(students.schoolId, user.schoolId), eq(students.userId, user.id)),
      )
      .limit(1);
    if (!student) return { data: [] };
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
          eq(payments.schoolId, user.schoolId),
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
  async teacherSalaries(user: AuthUser) {
    const [teacher] = await this.db
      .select({ id: teachers.id })
      .from(teachers)
      .where(
        and(eq(teachers.schoolId, user.schoolId), eq(teachers.userId, user.id)),
      )
      .limit(1);
    return {
      data: teacher
        ? await this.db
            .select()
            .from(salaryRecords)
            .where(eq(salaryRecords.teacherId, teacher.id))
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
    const [row] = await this.db
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
    if (!row) throw new Error('বেতন সংরক্ষণ করা যায়নি');
    await this.db
      .insert(ledgerEntries)
      .values({
        schoolId: user.schoolId,
        type: 'EXPENSE',
        amount: net,
        entryDate: row.paidAt!,
        description: `বেতন ${value.salaryMonth}`,
        sourceType: 'SALARY',
        sourceId: row.id,
        createdBy: user.id,
      });
    return { data: row };
  }
}
