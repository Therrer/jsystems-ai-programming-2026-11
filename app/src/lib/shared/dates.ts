// Pure calendar-date helpers shared by client and server (ADR-000 §4, ADR-001 §3.4).
// Dates are ISO strings "YYYY-MM-DD"; arithmetic runs in UTC so daylight-saving
// changes never shift a day count.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WARSAW = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's calendar date in Europe/Warsaw (the business time zone). */
export function todayInWarsaw(now: Date = new Date()): string {
  return WARSAW.format(now);
}

/** True for a real calendar date written exactly as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

function toUtc(iso: string): Date {
  if (!isIsoDate(iso)) throw new RangeError(`Not an ISO date: ${iso}`);
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** Adds calendar days. */
export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/** Adds calendar months, clamping to the last day of a shorter month (2024-02-29 + 24 → 2026-02-28). */
export function addMonthsClamped(iso: string, months: number): string {
  const date = toUtc(iso);
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUtc(target);
}
