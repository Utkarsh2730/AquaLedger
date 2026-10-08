import { localDay, localMonth, DEFAULT_TZ_OFFSET_MIN } from "./time";
import type { ReadingRec } from "./types";

/** litres per local day, per flat: Map<flatId, Map<day, litres>> */
export function dailyByFlat(readings: ReadingRec[], offsetMin = DEFAULT_TZ_OFFSET_MIN) {
  const out = new Map<string, Map<string, number>>();
  for (const r of readings) {
    const day = localDay(r.timestamp, offsetMin);
    let m = out.get(r.flatId);
    if (!m) out.set(r.flatId, (m = new Map()));
    m.set(day, (m.get(day) ?? 0) + r.litres);
  }
  return out;
}

/** litres per local month, per flat */
export function monthlyByFlat(readings: ReadingRec[], offsetMin = DEFAULT_TZ_OFFSET_MIN) {
  const out = new Map<string, Map<string, number>>();
  for (const r of readings) {
    const month = localMonth(r.timestamp, offsetMin);
    let m = out.get(r.flatId);
    if (!m) out.set(r.flatId, (m = new Map()));
    m.set(month, (m.get(month) ?? 0) + r.litres);
  }
  return out;
}

/** total litres per local month across all flats */
export function monthlyTotals(readings: ReadingRec[], offsetMin = DEFAULT_TZ_OFFSET_MIN) {
  const out = new Map<string, number>();
  for (const r of readings) {
    const month = localMonth(r.timestamp, offsetMin);
    out.set(month, (out.get(month) ?? 0) + r.litres);
  }
  return out;
}

/** total litres per local day across all flats */
export function dailyTotals(readings: ReadingRec[], offsetMin = DEFAULT_TZ_OFFSET_MIN) {
  const out = new Map<string, number>();
  for (const r of readings) {
    const day = localDay(r.timestamp, offsetMin);
    out.set(day, (out.get(day) ?? 0) + r.litres);
  }
  return out;
}

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function stdDev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export const round = (x: number, dp = 0) => Math.round(x * 10 ** dp) / 10 ** dp;
