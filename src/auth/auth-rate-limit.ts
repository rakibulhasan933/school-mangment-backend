import { TooManyRequestsException } from '@nestjs/common';

type Entry = { count: number; resetAt: number };

export class AuthRateLimit {
  private readonly entries = new Map<string, Entry>();

  check(scope: 'login' | 'forgot-password', ip: string, email: string) {
    const emailLimit = scope === 'login' ? 10 : 3;
    const ipLimit = scope === 'login' ? 30 : 10;
    const windowMs = 15 * 60 * 1000;
    const now = Date.now();
    const keys = [
      { key: `${scope}:ip:${ip}`, limit: ipLimit },
      { key: `${scope}:email:${email.toLowerCase()}`, limit: emailLimit },
    ];
    const active = keys.map(({ key, limit }) => ({ key, limit, entry: this.entries.get(key) }));
    const blocked = active.find(({ entry, limit }) => entry && entry.resetAt > now && entry.count >= limit);
    if (blocked?.entry) {
      const retryAfter = Math.max(1, Math.ceil((blocked.entry.resetAt - now) / 1000));
      throw new TooManyRequestsException({ message: 'চেষ্টা করার সীমা শেষ হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।', retryAfter });
    }
    for (const { key, entry } of active) {
      if (!entry || entry.resetAt <= now) this.entries.set(key, { count: 1, resetAt: now + windowMs });
      else entry.count += 1;
    }
    if (this.entries.size > 10000) this.cleanup();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}
