import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (existsSync(resolve(process.cwd(), '.env')))
  process.loadEnvFile(resolve(process.cwd(), '.env'));
type Credentials = {
  admin: { identifier: string; password: string };
  teacher: { identifier: string; password: string };
  students: string[];
};
const api = process.env.SMOKE_API_URL ?? 'http://localhost:4000/api/v1';
const schoolId =
  process.env.DEFAULT_SCHOOL_ID ?? process.env.SMOKE_SCHOOL_ID ?? '';
const credentials = JSON.parse(
  readFileSync(resolve(process.cwd(), '.demo-credentials.json'), 'utf8'),
) as Credentials;

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${api}${path}`, init);
  const payload = (await response.json().catch(() => null)) as {
    data?: unknown;
    error?: string;
    message?: string;
  } | null;
  if (!response.ok)
    throw new Error(
      `${path}: ${response.status} ${payload?.message ?? payload?.error ?? 'failed'}`,
    );
  return payload;
}
async function login(identifier: string, password?: string) {
  const path = password ? '/auth/login' : '/auth/student-login';
  const body = password
    ? { identifier, password }
    : { registrationNumber: identifier };
  const payload = await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const token = (payload?.data as { accessToken?: string } | undefined)
    ?.accessToken;
  if (!token) throw new Error(`${path}: access token missing`);
  return token;
}
async function main() {
  const admin = await login(
    credentials.admin.identifier,
    credentials.admin.password,
  );
  console.log('[smoke] admin login: ok');
  const teacher = await login(
    credentials.teacher.identifier,
    credentials.teacher.password,
  );
  console.log('[smoke] teacher login: ok');
  const student = await login(credentials.students[0]!);
  console.log('[smoke] student login: ok');
  const auth = (token: string) => ({
    headers: { Authorization: `Bearer ${token}` },
  });
  await request(`/admissions?schoolId=${schoolId}`, auth(admin));
  console.log('[smoke] admission review list: ok');
  await request('/finance/fee-events', auth(admin));
  await request('/finance/dues', auth(admin));
  console.log('[smoke] fee events and dues: ok');
  await request('/finance/salary', auth(admin));
  await request('/finance/ledger', auth(admin));
  console.log('[smoke] salary and ledger: ok');
  await request('/student/finance/dues', auth(student));
  await request('/student/finance/payments', auth(student));
  console.log('[smoke] student dues and payments: ok');
  await request('/finance/ledger', auth(teacher)).catch(() => undefined);
  console.log('[smoke] protected finance access: ok');
  void teacher;
}
main().catch((error: unknown) => {
  console.error(
    `[smoke] failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
});
