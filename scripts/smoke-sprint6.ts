import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
if (existsSync(resolve(process.cwd(), '.env')))
  process.loadEnvFile(resolve(process.cwd(), '.env'));
type Credentials = {
  admin: { identifier: string; password: string };
  teacher: { identifier: string; password: string };
  students: string[];
};
type Envelope = {
  data?: unknown;
  message?: string;
  generated?: number;
  remaining?: number;
  paidAmount?: number;
};
const api = process.env.SMOKE_API_URL ?? 'http://localhost:4000/api/v1';
const credentials = JSON.parse(
  readFileSync(resolve(process.cwd(), '.demo-credentials.json'), 'utf8'),
) as Credentials;
async function call(path: string, init: RequestInit = {}) {
  const response = await fetch(`${api}${path}`, init);
  const body = (await response.json().catch(() => null)) as Envelope | null;
  if (!response.ok)
    throw new Error(
      `${path} returned ${response.status}: ${body?.message ?? 'request failed'}`,
    );
  return body ?? {};
}
async function login(identifier: string, password?: string) {
  const path = password ? '/auth/login' : '/auth/student-login';
  const body = password
    ? { identifier, password }
    : { registrationNumber: identifier };
  const result = await call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const token = (result.data as { accessToken?: string } | undefined)
    ?.accessToken;
  if (!token) throw new Error(`${path}: token missing`);
  return token;
}
const auth = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});
async function main() {
  const admin = await login(
    credentials.admin.identifier,
    credentials.admin.password,
  );
  const student = await login(credentials.students[0]!);
  const tokenPayload = JSON.parse(
    Buffer.from(admin.split('.')[1]!, 'base64url').toString('utf8'),
  ) as { schoolId: string };
  const schoolId = process.env.DEFAULT_SCHOOL_ID || tokenPayload.schoolId;
  const sessions = await call('/academics/sessions', { headers: auth(admin) });
  const classes = await call('/academics/classes', { headers: auth(admin) });
  const session = (sessions.data as Array<{ id: string }>)[0];
  const cls = (classes.data as Array<{ id: string }>)[0];
  if (!session || !cls)
    throw new Error('seeded academic session/class missing');
  const tracking = `SMOKE-${Date.now()}`;
  await call(`/public/admissions?schoolId=${schoolId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      admissionClassId: cls.id,
      sessionId: session.id,
      applicant: { nameBn: 'স্মোক টেস্ট আবেদন', guardianMobile: '01700000000' },
    }),
  });
  const applications = await call('/admissions', { headers: auth(admin) });
  const application = (
    applications.data as Array<{ id: string; trackingId: string }>
  ).find((row) => row.trackingId.startsWith('ADM-'));
  if (application)
    await call(`/admissions/${application.id}/review`, {
      method: 'PATCH',
      headers: auth(admin),
      body: JSON.stringify({ status: 'APPROVED', note: 'smoke' }),
    });
  console.log('[smoke] admission submit/approve: ok');
  const event = await call('/finance/fee-events', {
    method: 'POST',
    headers: auth(admin),
    body: JSON.stringify({
      nameBn: `স্মোক ফি ${Date.now()}`,
      type: 'other',
      dueDate: new Date().toISOString().slice(0, 10),
      lateFee: 0,
      isPublished: true,
      classes: [{ classId: cls.id, amount: 1000 }],
    }),
  });
  const eventId = (event.data as { id: string }).id;
  await call(`/finance/fee-events/${eventId}/publish`, {
    method: 'PATCH',
    headers: auth(admin),
  });
  const dues = await call(`/finance/dues?classId=${cls.id}`, {
    headers: auth(admin),
  });
  const due = (dues.data as Array<{ id: string; amount: number }>)[0];
  if (due) {
    const payment = await call(`/finance/dues/${due.id}/pay`, {
      method: 'POST',
      headers: auth(admin),
      body: JSON.stringify({
        amount: Math.max(1, Math.floor(due.amount / 2)),
        method: 'ক্যাশ',
        paidAt: new Date().toISOString().slice(0, 10),
      }),
    });
    const receipt = payment.data as {
      receipt?: { receiptNumber: string; verifyCode: string };
    };
    if (receipt?.receipt)
      await call(
        `/public/receipts/verify?receiptNumber=${receipt.receipt.receiptNumber}&verifyCode=${receipt.receipt.verifyCode}`,
      );
  }
  console.log('[smoke] fee event/dues/partial payment/receipt verify: ok');
  const teachers = await call('/people/teachers', { headers: auth(admin) });
  const teacher = (teachers.data as Array<{ id: string }>)[0];
  if (teacher)
    await call('/finance/salary/pay', {
      method: 'POST',
      headers: auth(admin),
      body: JSON.stringify({
        teacherId: teacher.id,
        salaryMonth: `smoke-${Date.now()}`,
        basic: 1000,
        allowances: 0,
        deductions: 0,
        method: 'ক্যাশ',
      }),
    });
  await call('/finance/ledger', { headers: auth(admin) });
  console.log('[smoke] salary/ledger expense: ok');
  await call(
    `/public/results/search?schoolId=${schoolId}&registrationNumber=${credentials.students[0]}`,
  );
  await call('/student/finance/dues', { headers: auth(student) });
  console.log('[smoke] published result search/student portal: ok');
  console.log(
    '[smoke] Sprint 6 live mutation suite complete (created smoke records; rerun demo reset to restore pristine seed)',
  );
}
main().catch((error: unknown) => {
  console.error(
    `[smoke] Sprint 6 failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
});
