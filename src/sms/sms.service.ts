import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, ne } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  exams,
  feeEvents,
  results,
  schools,
  settings,
  smsLogs,
  studentFees,
  students,
  teachers,
  users,
} from '../db/schema.js';
import type { AuthUser } from '../auth/auth.types.js';

export type SmsSettings = {
  provider: string;
  apiKey: string;
  senderId: string;
  isEnabled: boolean;
  testMode: boolean;
  dueTemplate: string;
  resultTemplate: string;
};

const DEFAULT_SETTINGS: SmsSettings = {
  provider: 'bulksmsbd',
  apiKey: '',
  senderId: '',
  isEnabled: false,
  testMode: true,
  dueTemplate:
    'প্রিয় অভিভাবক, {name}-এর {event} বাবদ ৳{amount} বকেয়া রয়েছে। অনুগ্রহ করে পরিশোধ করুন। — {school}',
  resultTemplate:
    'প্রিয় অভিভাবক, {name} {exam} পরীক্ষায় GPA {gpa} ({letter}) পেয়েছে। মোট নম্বর {total}। — {school}',
};

export type Audience = {
  type: 'class' | 'section' | 'teachers' | 'custom';
  classId?: string;
  sectionId?: string;
  numbers?: string[];
};

type Recipient = { name: string; mobile: string; studentId?: string };

/** Normalize a Bangladeshi mobile number to 8801XXXXXXXXX, or null. */
export function normalizeBdMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let n = String(raw).replace(/[\s\-+]/g, '');
  if (n.startsWith('880')) n = n.slice(3);
  if (n.startsWith('0')) n = n.slice(1);
  if (!/^1[3-9]\d{8}$/.test(n)) return null;
  return `880${n}`;
}

/** SMS segment count: GSM-7 (160/153) vs Unicode (70/67) per part. */
export function smsSegments(message: string): number {
  const unicode = /[^\x00-\x7F]/.test(message);
  const len = [...message].length;
  if (len === 0) return 0;
  if (unicode) return len <= 70 ? 1 : Math.ceil(len / 67);
  return len <= 160 ? 1 : Math.ceil(len / 153);
}

@Injectable()
export class SmsService {
  private readonly db = createDb();

  // ---------- settings ----------
  async getSettingsRaw(schoolId: string): Promise<SmsSettings> {
    const [row] = await this.db
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.schoolId, schoolId), eq(settings.key, 'sms')))
      .limit(1);
    const stored = (row?.value ?? {}) as Partial<SmsSettings>;
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async getSettings(user: AuthUser) {
    const s = await this.getSettingsRaw(user.schoolId);
    return {
      data: {
        provider: s.provider,
        senderId: s.senderId,
        isEnabled: s.isEnabled,
        testMode: s.testMode,
        dueTemplate: s.dueTemplate,
        resultTemplate: s.resultTemplate,
        hasApiKey: Boolean(s.apiKey),
        apiKeyHint: s.apiKey ? `••••${s.apiKey.slice(-2)}` : '',
        configured: Boolean(s.apiKey && s.senderId),
      },
    };
  }

  async updateSettings(user: AuthUser, value: Partial<SmsSettings>) {
    const current = await this.getSettingsRaw(user.schoolId);
    const next: SmsSettings = {
      ...current,
      ...value,
      // An empty apiKey in the payload means "keep the stored one".
      apiKey: value.apiKey ? value.apiKey : current.apiKey,
    };
    const [existing] = await this.db
      .select({ id: settings.id })
      .from(settings)
      .where(and(eq(settings.schoolId, user.schoolId), eq(settings.key, 'sms')))
      .limit(1);
    if (existing) {
      await this.db
        .update(settings)
        .set({ value: next, updatedAt: new Date() })
        .where(eq(settings.id, existing.id));
    } else {
      await this.db
        .insert(settings)
        .values({ schoolId: user.schoolId, key: 'sms', value: next });
    }
    return this.getSettings(user);
  }

  // ---------- provider ----------
  private async providerSend(
    cfg: SmsSettings,
    numbers: string[],
    message: string,
  ): Promise<{ ok: boolean; response: string }> {
    // BulkSMSBD (api.bulksmsbd.net) — one request per batch of numbers.
    const body = new URLSearchParams({
      api_key: cfg.apiKey,
      type: 'text',
      number: numbers.join(','),
      senderid: cfg.senderId,
      message,
    });
    try {
      const res = await fetch('https://api.bulksmsbd.net/api/smsapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const text = await res.text();
      let ok = res.ok;
      try {
        const parsed = JSON.parse(text) as { response_code?: number };
        if (typeof parsed.response_code === 'number')
          ok = parsed.response_code === 202;
      } catch {
        /* non-JSON reply: fall back to the HTTP status */
      }
      return { ok, response: text.slice(0, 300) };
    } catch (error) {
      return {
        ok: false,
        response: `fetch failed: ${String(error).slice(0, 200)}`,
      };
    }
  }

  async balance(user: AuthUser) {
    const cfg = await this.getSettingsRaw(user.schoolId);
    if (!cfg.apiKey) return { data: { configured: false, balance: null } };
    try {
      const res = await fetch(
        `https://api.bulksmsbd.net/api/getBalanceApi?api_key=${encodeURIComponent(cfg.apiKey)}`,
      );
      const text = await res.text();
      let balance: string | null = null;
      try {
        const parsed = JSON.parse(text) as { balance?: string };
        balance = parsed.balance ?? null;
      } catch {
        balance = text.slice(0, 60);
      }
      return { data: { configured: true, balance } };
    } catch {
      return { data: { configured: true, balance: null } };
    }
  }

  // ---------- recipients ----------
  async resolveAudience(
    schoolId: string,
    audience: Audience,
  ): Promise<{ recipients: Recipient[]; skipped: number }> {
    const byNumber = new Map<string, Recipient>();
    let skipped = 0;
    const add = (name: string, rawMobile: string | null, studentId?: string) => {
      const mobile = normalizeBdMobile(rawMobile);
      if (!mobile) {
        skipped++;
        return;
      }
      if (!byNumber.has(mobile)) byNumber.set(mobile, { name, mobile, studentId });
    };
    if (audience.type === 'class' && !audience.classId)
      throw new BadRequestException('আগে শ্রেণি বেছে নিন');
    if (audience.type === 'section' && !audience.sectionId)
      throw new BadRequestException('আগে শাখা বেছে নিন');
    if (audience.type === 'custom') {
      for (const n of audience.numbers ?? []) add('—', n);
    } else if (audience.type === 'teachers') {
      const rows = await this.db
        .select({ name: users.displayNameBn, mobile: teachers.mobile })
        .from(teachers)
        .innerJoin(users, eq(users.id, teachers.userId))
        .where(eq(teachers.schoolId, schoolId));
      for (const r of rows) add(r.name, r.mobile);
    } else {
      const conditions = [eq(students.schoolId, schoolId)];
      if (audience.type === 'section' && audience.sectionId)
        conditions.push(eq(students.sectionId, audience.sectionId));
      else if (audience.classId)
        conditions.push(eq(students.classId, audience.classId));
      const rows = await this.db
        .select({
          id: students.id,
          name: users.displayNameBn,
          mobile: students.guardianMobile,
        })
        .from(students)
        .innerJoin(users, eq(users.id, students.userId))
        .where(and(...conditions));
      for (const r of rows) add(r.name, r.mobile, r.id);
    }
    return { recipients: [...byNumber.values()], skipped };
  }

  async preview(user: AuthUser, audience: Audience) {
    const { recipients, skipped } = await this.resolveAudience(
      user.schoolId,
      audience,
    );
    return {
      data: {
        count: recipients.length,
        skipped,
        sample: recipients.slice(0, 5),
      },
    };
  }

  // ---------- sending ----------
  private async dispatch(
    user: AuthUser,
    cfg: SmsSettings,
    kind: string,
    items: Array<{ recipient: Recipient; message: string }>,
  ) {
    const live = cfg.isEnabled && !cfg.testMode && Boolean(cfg.apiKey);
    let sent = 0;
    let failed = 0;
    let totalSegments = 0;
    const BATCH = 100;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      // Group by identical message so one provider call covers the batch.
      const byMessage = new Map<string, Recipient[]>();
      for (const item of batch) {
        const list = byMessage.get(item.message) ?? [];
        list.push(item.recipient);
        byMessage.set(item.message, list);
      }
      for (const [message, recipients] of byMessage) {
        const segments = smsSegments(message);
        let status = 'test';
        let response = 'test mode — not sent to gateway';
        if (live) {
          const result = await this.providerSend(
            cfg,
            recipients.map((r) => r.mobile),
            message,
          );
          status = result.ok ? 'sent' : 'failed';
          response = result.response;
        }
        for (const r of recipients) {
          totalSegments += segments;
          if (status === 'failed') failed++;
          else sent++;
          await this.db.insert(smsLogs).values({
            schoolId: user.schoolId,
            kind,
            recipientName: r.name,
            mobile: r.mobile,
            message,
            segments,
            status,
            providerResponse: response,
            sentBy: user.id,
          });
        }
      }
    }
    return { sent, failed, totalSegments, testMode: !live };
  }

  async send(user: AuthUser, value: { audience: Audience; message: string }) {
    const message = String(value.message ?? '').trim();
    if (!message) throw new BadRequestException('বার্তা লিখুন');
    const cfg = await this.getSettingsRaw(user.schoolId);
    const { recipients, skipped } = await this.resolveAudience(
      user.schoolId,
      value.audience,
    );
    if (!recipients.length)
      throw new BadRequestException('কোনো বৈধ মোবাইল নম্বর পাওয়া যায়নি');
    const result = await this.dispatch(
      user,
      cfg,
      'manual',
      recipients.map((recipient) => ({ recipient, message })),
    );
    return { data: { ...result, recipients: recipients.length, skipped } };
  }

  async sendDue(user: AuthUser, value: { feeEventId: string }) {
    const [event] = await this.db
      .select()
      .from(feeEvents)
      .where(
        and(
          eq(feeEvents.id, value.feeEventId),
          eq(feeEvents.schoolId, user.schoolId),
        ),
      )
      .limit(1);
    if (!event) throw new NotFoundException('ফি ইভেন্ট পাওয়া যায়নি');
    const cfg = await this.getSettingsRaw(user.schoolId);
    const [school] = await this.db
      .select({ nameBn: schools.nameBn })
      .from(schools)
      .where(eq(schools.id, user.schoolId))
      .limit(1);
    const rows = await this.db
      .select({
        studentId: studentFees.studentId,
        amount: studentFees.amount,
        paidAmount: studentFees.paidAmount,
        name: users.displayNameBn,
        mobile: students.guardianMobile,
      })
      .from(studentFees)
      .innerJoin(students, eq(students.id, studentFees.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(
        and(
          eq(studentFees.feeEventId, value.feeEventId),
          ne(studentFees.status, 'PAID'),
        ),
      );
    const items: Array<{ recipient: Recipient; message: string }> = [];
    let skipped = 0;
    const seen = new Set<string>();
    for (const r of rows) {
      const mobile = normalizeBdMobile(r.mobile);
      if (!mobile) {
        skipped++;
        continue;
      }
      const dueTaka = Math.max(0, Math.round((r.amount - r.paidAmount) / 100));
      const message = cfg.dueTemplate
        .replaceAll('{name}', r.name)
        .replaceAll('{event}', event.nameBn)
        .replaceAll('{amount}', String(dueTaka))
        .replaceAll('{school}', school?.nameBn ?? '');
      const key = `${mobile}|${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ recipient: { name: r.name, mobile, studentId: r.studentId }, message });
    }
    if (!items.length)
      throw new BadRequestException('বকেয়া থাকা কোনো শিক্ষার্থী পাওয়া যায়নি');
    const result = await this.dispatch(user, cfg, 'due', items);
    return { data: { ...result, recipients: items.length, skipped } };
  }

  async sendResult(user: AuthUser, value: { examId: string }) {
    const [exam] = await this.db
      .select()
      .from(exams)
      .where(
        and(eq(exams.id, value.examId), eq(exams.schoolId, user.schoolId)),
      )
      .limit(1);
    if (!exam) throw new NotFoundException('পরীক্ষা পাওয়া যায়নি');
    const cfg = await this.getSettingsRaw(user.schoolId);
    const [school] = await this.db
      .select({ nameBn: schools.nameBn })
      .from(schools)
      .where(eq(schools.id, user.schoolId))
      .limit(1);
    const rows = await this.db
      .select({
        name: users.displayNameBn,
        mobile: students.guardianMobile,
        gpa: results.gpa,
        letter: results.letter,
        total: results.totalMarks,
      })
      .from(results)
      .innerJoin(students, eq(students.id, results.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(eq(results.examId, value.examId));
    const items: Array<{ recipient: Recipient; message: string }> = [];
    let skipped = 0;
    for (const r of rows) {
      const mobile = normalizeBdMobile(r.mobile);
      if (!mobile) {
        skipped++;
        continue;
      }
      const message = cfg.resultTemplate
        .replaceAll('{name}', r.name)
        .replaceAll('{exam}', exam.nameBn)
        .replaceAll('{gpa}', String(r.gpa))
        .replaceAll('{letter}', r.letter)
        .replaceAll('{total}', String(r.total))
        .replaceAll('{school}', school?.nameBn ?? '');
      items.push({ recipient: { name: r.name, mobile }, message });
    }
    if (!items.length)
      throw new BadRequestException('এই পরীক্ষার কোনো ফলাফল পাওয়া যায়নি');
    const result = await this.dispatch(user, cfg, 'result', items);
    return { data: { ...result, recipients: items.length, skipped } };
  }

  // ---------- logs ----------
  async logs(user: AuthUser, kind?: string, limit = 50, offset = 0) {
    const conditions = [eq(smsLogs.schoolId, user.schoolId)];
    if (kind) conditions.push(eq(smsLogs.kind, kind));
    const rows = await this.db
      .select()
      .from(smsLogs)
      .where(and(...conditions))
      .orderBy(desc(smsLogs.createdAt))
      .limit(Math.min(limit, 200))
      .offset(offset);
    return { data: rows };
  }
}
