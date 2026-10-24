/**
 * B10: exam schedule sanity. A result publication date (publishAt) that
 * precedes the exam's own end date (endsAt) is nonsense — the live demo
 * had an annual exam ending 15 Dec whose "result" was set to publish
 * 20 Nov. Compared as instants; date-only values parse as UTC midnight.
 * Returns a Bengali error message, or null when the schedule is sane
 * (or when either side is missing and nothing can be compared).
 */
export function examScheduleError(input: {
  endsAt?: string | Date | null;
  publishAt?: string | Date | null;
}): string | null {
  if (!input.endsAt || !input.publishAt) return null;
  const end = new Date(input.endsAt).getTime();
  const publish = new Date(input.publishAt).getTime();
  if (Number.isNaN(end) || Number.isNaN(publish)) return null;
  if (publish < end)
    return 'ফলাফল প্রকাশের তারিখ পরীক্ষা শেষের তারিখের আগে হতে পারে না';
  return null;
}
