import { dailyByFlat, mean, stdDev, round } from "./aggregate";
import { addDays, localDay, localHour, DEFAULT_TZ_OFFSET_MIN } from "./time";
import type { FlatRec, ReadingRec, AlertType, Severity } from "./types";
import { flatLabel } from "./types";

export interface LeakFinding {
  flatId: string;
  flatLabel: string;
  type: AlertType;
  severity: Severity;
  message: string;
  /** numbers behind the finding, for the UI and for the AI summary */
  evidence: Record<string, number | string>;
}

export interface LeakOptions {
  /** local day to evaluate for spikes (default: yesterday relative to `now`) */
  targetDay?: string;
  now?: Date;
  zThreshold?: number; // default 2.5 standard deviations
  baselineDays?: number; // default 30
  minBaselineDays?: number; // default 14
  nightStartHour?: number; // default 2 (2 a.m.)
  nightEndHour?: number; // default 4 (4 a.m.), exclusive
  nightMinLitresPerHour?: number; // default 4 L/h counts as "flowing"
  nightMinNights?: number; // default 3 nights
  nightLookbackNights?: number; // default 7
  tzOffsetMin?: number;
}

/**
 * Spike rule: a flat's usage on targetDay exceeds its trailing 30-day mean by more than
 * 2.5 standard deviations (and by at least 25% so very steady flats don't trip on noise).
 */
export function detectSpikes(flats: FlatRec[], readings: ReadingRec[], opts: LeakOptions = {}): LeakFinding[] {
  const tz = opts.tzOffsetMin ?? DEFAULT_TZ_OFFSET_MIN;
  const target = opts.targetDay ?? addDays(localDay(opts.now ?? new Date(), tz), -1);
  const z = opts.zThreshold ?? 2.5;
  const baselineDays = opts.baselineDays ?? 30;
  const minDays = opts.minBaselineDays ?? 14;
  const byFlat = dailyByFlat(readings, tz);
  const findings: LeakFinding[] = [];

  for (const flat of flats) {
    const days = byFlat.get(flat.id);
    if (!days) continue;
    const today = days.get(target);
    if (today === undefined) continue;
    const baseline: number[] = [];
    for (let i = 1; i <= baselineDays; i++) {
      const v = days.get(addDays(target, -i));
      if (v !== undefined) baseline.push(v);
    }
    if (baseline.length < minDays) continue;
    const m = mean(baseline);
    const sd = Math.max(stdDev(baseline), m * 0.05);
    const score = (today - m) / sd;
    if (score > z && today > m * 1.25) {
      const severity: Severity = score > 6 ? "high" : score > 4 ? "medium" : "low";
      findings.push({
        flatId: flat.id,
        flatLabel: flatLabel(flat),
        type: "spike",
        severity,
        message: `${flatLabel(flat)} used ${round(today)} L on ${target}, ${round(today / m, 1)}x its 30-day average of ${round(m)} L (z = ${round(score, 1)}).`,
        evidence: { day: target, litres: round(today), mean: round(m), sd: round(sd, 1), z: round(score, 2) },
      });
    }
  }
  return findings;
}

/**
 * Night-flow rule: steady flow in every hour between 2 and 4 a.m. on 3+ of the last 7 nights.
 * Only hourly (or finer) readings are considered; daily totals cannot show time of day.
 */
export function detectNightFlow(flats: FlatRec[], readings: ReadingRec[], opts: LeakOptions = {}): LeakFinding[] {
  const tz = opts.tzOffsetMin ?? DEFAULT_TZ_OFFSET_MIN;
  const start = opts.nightStartHour ?? 2;
  const end = opts.nightEndHour ?? 4;
  const minFlow = opts.nightMinLitresPerHour ?? 4;
  const minNights = opts.nightMinNights ?? 3;
  const lookback = opts.nightLookbackNights ?? 7;
  const lastDay = opts.targetDay ?? addDays(localDay(opts.now ?? new Date(), tz), -1);
  const firstDay = addDays(lastDay, -(lookback - 1));

  // flatId -> day -> hour -> litres
  const hourly = new Map<string, Map<string, Map<number, number>>>();
  for (const r of readings) {
    if (r.periodMinutes > 60) continue;
    const day = localDay(r.timestamp, tz);
    if (day < firstDay || day > lastDay) continue;
    const hour = localHour(r.timestamp, tz);
    if (hour < start || hour >= end) continue;
    let byDay = hourly.get(r.flatId);
    if (!byDay) hourly.set(r.flatId, (byDay = new Map()));
    let byHour = byDay.get(day);
    if (!byHour) byDay.set(day, (byHour = new Map()));
    byHour.set(hour, (byHour.get(hour) ?? 0) + r.litres);
  }

  const findings: LeakFinding[] = [];
  for (const flat of flats) {
    const byDay = hourly.get(flat.id);
    if (!byDay) continue;
    const flowingNights: { day: string; avg: number }[] = [];
    for (const [day, byHour] of byDay) {
      const vals: number[] = [];
      for (let h = start; h < end; h++) vals.push(byHour.get(h) ?? 0);
      const steady = vals.every((v) => v >= minFlow) && Math.min(...vals) >= 0.5 * Math.max(...vals);
      if (steady) flowingNights.push({ day, avg: mean(vals) });
    }
    if (flowingNights.length >= minNights) {
      const avg = mean(flowingNights.map((n) => n.avg));
      const litresPerDay = avg * 24;
      const severity: Severity = avg >= 15 ? "high" : avg >= 8 ? "medium" : "low";
      findings.push({
        flatId: flat.id,
        flatLabel: flatLabel(flat),
        type: "night_flow",
        severity,
        message: `${flatLabel(flat)} shows steady flow of ~${round(avg, 1)} L/h between ${start} and ${end} a.m. on ${flowingNights.length} of the last ${lookback} nights: likely a running tap or cistern leak (~${round(litresPerDay)} L/day wasted).`,
        evidence: { nights: flowingNights.length, avgLitresPerHour: round(avg, 1), estimatedWastePerDay: round(litresPerDay) },
      });
    }
  }
  return findings;
}

/**
 * The day the nightly scan should judge: yesterday, unless the data stops earlier (e.g. demo
 * data loaded a few days ago, or a meter feed that lags), in which case the last day with
 * metered data. Live meter ticks don't count, so one simulator run can't hide older days.
 */
export function pickTargetDay(readings: ReadingRec[], now = new Date(), tzOffsetMin = DEFAULT_TZ_OFFSET_MIN): string {
  const yesterday = addDays(localDay(now, tzOffsetMin), -1);
  let last = "";
  for (const r of readings) {
    if (r.source === "iot") continue;
    const day = localDay(r.timestamp, tzOffsetMin);
    if (day > last) last = day;
  }
  return last && last < yesterday ? last : yesterday;
}

export function detectLeaks(flats: FlatRec[], readings: ReadingRec[], opts: LeakOptions = {}): LeakFinding[] {
  return [...detectSpikes(flats, readings, opts), ...detectNightFlow(flats, readings, opts)];
}

/**
 * Live rule used by the meter-ingest Lambda on every tick: the current flow rate is far above
 * the flat's normal average rate. Returns null when the reading looks normal.
 */
export function detectLiveSpike(
  litres: number,
  periodMinutes: number,
  baselineLitresPerMinute: number,
  opts: { multiplier?: number; minLitresPerMinute?: number } = {}
): { rate: number; ratio: number; severity: Severity } | null {
  const rate = litres / Math.max(periodMinutes, 1);
  const multiplier = opts.multiplier ?? 6;
  const minRate = opts.minLitresPerMinute ?? 2;
  const base = Math.max(baselineLitresPerMinute, 0.05);
  const ratio = rate / base;
  if (rate < minRate || ratio < multiplier) return null;
  return { rate: round(rate, 2), ratio: round(ratio, 1), severity: ratio > 30 ? "high" : ratio > 15 ? "medium" : "low" };
}
