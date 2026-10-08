// Societies are local (India by default), so "a day" and "2-4 a.m." are in local time.
// We use a fixed UTC offset (IST = +330 min) instead of a tz database to keep Lambdas tiny.

export const DEFAULT_TZ_OFFSET_MIN = 330;

/** Local calendar day (YYYY-MM-DD) of a UTC instant. */
export function localDay(iso: string | Date, offsetMin = DEFAULT_TZ_OFFSET_MIN): string {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  return new Date(t + offsetMin * 60_000).toISOString().slice(0, 10);
}

/** Local hour (0-23) of a UTC instant. */
export function localHour(iso: string | Date, offsetMin = DEFAULT_TZ_OFFSET_MIN): number {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  return new Date(t + offsetMin * 60_000).getUTCHours();
}

/** Local month (YYYY-MM) of a UTC instant. */
export function localMonth(iso: string | Date, offsetMin = DEFAULT_TZ_OFFSET_MIN): string {
  return localDay(iso, offsetMin).slice(0, 7);
}

/** UTC ISO instant for a local date + hour. */
export function localToUtcIso(day: string, hour = 0, offsetMin = DEFAULT_TZ_OFFSET_MIN): string {
  const t = Date.parse(`${day}T00:00:00Z`) + hour * 3_600_000 - offsetMin * 60_000;
  return new Date(t).toISOString();
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}
