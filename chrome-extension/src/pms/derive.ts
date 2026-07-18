// Pure computed-field helpers for PMS payloads ("derive.*" refs in
// manifests). Quixy stores IST calendar dates shifted to UTC (IST − 5:30 ⇒
// previous day 18:30:00) and keeps a parallel local triple representation —
// both verified against a captured live submission. Getting these wrong
// lands the leave on the wrong day, so keep this library small and boring.

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function parseInputDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid date "${value}" — expected YYYY-MM-DD.`);
  const [, year, month, day] = match;
  const date: CalendarDate = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (
    check.getUTCFullYear() !== date.year ||
    check.getUTCMonth() !== date.month - 1 ||
    check.getUTCDate() !== date.day
  ) {
    throw new Error(`"${value}" is not a real calendar date.`);
  }
  return date;
}

function toUtcMillis(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** IST calendar date → Quixy UTC datetime: previous day at 18:30:00.00. */
export function quixyUtcDate(date: CalendarDate): string {
  const previous = new Date(toUtcMillis(date) - 24 * 60 * 60 * 1000);
  return `${previous.getUTCFullYear()}-${pad(previous.getUTCMonth() + 1)}-${pad(
    previous.getUTCDate(),
  )}T18:30:00.00`;
}

/** "23-Jul-2026" — the local display format used inside the dates triple. */
export function displayDate(date: CalendarDate): string {
  return `${pad(date.day)}-${MONTH_NAMES[date.month - 1]}-${date.year}`;
}

/** Inclusive day count of the range. */
export function rawDayCount(from: CalendarDate, to: CalendarDate): number {
  return Math.round((toUtcMillis(to) - toUtcMillis(from)) / 86_400_000) + 1;
}

/** ["from", "to", [every day in range]] in display format. */
export function datesTriple(
  from: CalendarDate,
  to: CalendarDate,
): [string, string, string[]] {
  const days: string[] = [];
  for (let ms = toUtcMillis(from); ms <= toUtcMillis(to); ms += 86_400_000) {
    const day = new Date(ms);
    days.push(
      displayDate({
        year: day.getUTCFullYear(),
        month: day.getUTCMonth() + 1,
        day: day.getUTCDate(),
      }),
    );
  }
  return [displayDate(from), displayDate(to), days];
}

/** Current UTC time at minute precision: "2026-07-18T17:29:00.00". */
export function nowUtcMinute(now = new Date()): string {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(
    now.getUTCDate(),
  )}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:00.00`;
}

/** Today as an IST calendar date (the browser runs in the user's timezone). */
export function todayLocal(now = new Date()): CalendarDate {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

/** Re-emit a Quixy datetime string with the ".00" seconds-fraction suffix
 * SaveAppData expects ("2024-06-16T18:30:00" → "2024-06-16T18:30:00.00"). */
export function quixyDateTimeFormat(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value}.00`
    : value;
}
