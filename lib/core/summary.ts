import { dailyByFlat, dailyTotals, monthlyByFlat, monthlyTotals, mean, round } from "./aggregate";
import { forecastMonth, type Forecast } from "./forecast";
import { addDays, addMonths, localDay, localMonth, DEFAULT_TZ_OFFSET_MIN } from "./time";
import type { AlertRec, FlatRec, ReadingRec, SupplyRec, TankerRec } from "./types";
import { flatLabel } from "./types";

export interface SourceMonth {
  month: string;
  municipalLitres: number;
  borewellLitres: number;
  tankerLitres: number;
  municipalCost: number;
  borewellCost: number;
  tankerCost: number;
  tankerCount: number;
  consumedLitres: number;
}

export interface DashboardSummary {
  societyId: string;
  asOf: string;
  currentMonth: string;
  kpis: {
    litresThisMonth: number;
    litresLastMonth: number;
    costThisMonth: number;
    costLastMonth: number;
    costPerKl: number;
    openAlerts: number;
    flats: number;
    avgLitresPerFlatPerDay: number;
  };
  monthly: SourceMonth[];
  costPerKlBySource: { source: string; costPerKl: number; litres: number; cost: number }[];
  topFlats: { flatId: string; flatLabel: string; litres: number; vsAverage: number }[];
  dailyTrend: { day: string; litres: number }[];
  forecast: Forecast | null;
  impact: LeakImpact;
}

/** What leak detection is worth: water and money a flat's leak would cost per month. */
export interface LeakImpact {
  /** flats with a usage-spike or night-flow alert in the last 90 days */
  leaksCaught: number;
  fixed: number;
  open: number;
  litresPerMonth: number;
  rupeesPerMonth: number;
  /** price the saving is valued at: tanker ₹/kL (the marginal water a society buys) */
  rupeesPerKl: number;
}

export function buildImpact(alerts: AlertRec[], rupeesPerKl: number, now = new Date()): LeakImpact {
  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const byFlat = new Map<string, { waste: number; open: boolean }>();
  for (const a of alerts) {
    if (a.type === "live_spike" || a.detectedAt < since) continue;
    const cur = byFlat.get(a.flatId) ?? { waste: 0, open: false };
    byFlat.set(a.flatId, { waste: Math.max(cur.waste, a.wasteLitresPerDay ?? 0), open: cur.open || !a.resolved });
  }
  const litresPerMonth = [...byFlat.values()].reduce((s, f) => s + f.waste * 30, 0);
  const open = [...byFlat.values()].filter((f) => f.open).length;
  return {
    leaksCaught: byFlat.size,
    fixed: byFlat.size - open,
    open,
    litresPerMonth: round(litresPerMonth),
    rupeesPerMonth: round((litresPerMonth / 1000) * rupeesPerKl),
    rupeesPerKl,
  };
}

export interface SocietyData {
  societyId: string;
  flats: FlatRec[];
  readings: ReadingRec[];
  supplies: SupplyRec[];
  tankers: TankerRec[];
  alerts: AlertRec[];
}

export function sourceMonths(data: SocietyData, tz = DEFAULT_TZ_OFFSET_MIN): SourceMonth[] {
  const months = new Map<string, SourceMonth>();
  const get = (month: string) => {
    let m = months.get(month);
    if (!m) {
      m = { month, municipalLitres: 0, borewellLitres: 0, tankerLitres: 0, municipalCost: 0, borewellCost: 0, tankerCost: 0, tankerCount: 0, consumedLitres: 0 };
      months.set(month, m);
    }
    return m;
  };
  for (const s of data.supplies) {
    const m = get(s.date.slice(0, 7));
    if (s.type === "municipal") (m.municipalLitres += s.litres), (m.municipalCost += s.cost);
    else (m.borewellLitres += s.litres), (m.borewellCost += s.cost);
  }
  for (const t of data.tankers) {
    const m = get(t.date.slice(0, 7));
    m.tankerLitres += t.litres;
    m.tankerCost += t.cost;
    m.tankerCount += 1;
  }
  for (const [month, litres] of monthlyTotals(data.readings, tz)) get(month).consumedLitres = round(litres);
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export const monthCost = (m: SourceMonth) => m.municipalCost + m.borewellCost + m.tankerCost;

/** Forecast targetMonth from the months before `currentMonth` (the current month is incomplete). */
export function buildForecast(months: SourceMonth[], targetMonth: string, currentMonth = addMonths(targetMonth, -1)): Forecast | null {
  const complete = months.filter((m) => m.month < currentMonth && m.month < targetMonth && m.consumedLitres > 0);
  if (!complete.length) return null;
  const map = (f: (m: SourceMonth) => number) => new Map(complete.map((m) => [m.month, f(m)]));
  return forecastMonth({
    targetMonth,
    lastCompleteMonth: complete[complete.length - 1].month,
    consumption: map((m) => m.consumedLitres),
    municipal: map((m) => m.municipalLitres),
    borewell: map((m) => m.borewellLitres),
    tankerLitres: map((m) => m.tankerLitres),
    tankerCost: map((m) => m.tankerCost),
    tankerCount: map((m) => m.tankerCount),
  });
}

export function buildDashboard(data: SocietyData, now = new Date(), tz = DEFAULT_TZ_OFFSET_MIN): DashboardSummary {
  const currentMonth = localMonth(now, tz);
  const lastMonth = addMonths(currentMonth, -1);
  const months = sourceMonths(data, tz);
  const cur = months.find((m) => m.month === currentMonth);
  const prev = months.find((m) => m.month === lastMonth);

  // cost per kL by source over the whole window
  const tot = months.reduce(
    (a, m) => ({
      ml: a.ml + m.municipalLitres, mc: a.mc + m.municipalCost,
      bl: a.bl + m.borewellLitres, bc: a.bc + m.borewellCost,
      tl: a.tl + m.tankerLitres, tc: a.tc + m.tankerCost,
    }),
    { ml: 0, mc: 0, bl: 0, bc: 0, tl: 0, tc: 0 }
  );
  const perKl = (c: number, l: number) => (l > 0 ? round((c / l) * 1000, 1) : 0);

  // top flats over the last 30 days
  const today = localDay(now, tz);
  const from = addDays(today, -30);
  const daily = dailyByFlat(data.readings, tz);
  const last30 = data.flats.map((f) => {
    let litres = 0;
    for (const [day, l] of daily.get(f.id) ?? []) if (day >= from && day < today) litres += l;
    return { flatId: f.id, flatLabel: flatLabel(f), litres: round(litres) };
  });
  const avg = mean(last30.map((x) => x.litres));
  const topFlats = [...last30]
    .sort((a, b) => b.litres - a.litres)
    .slice(0, 10)
    .map((x) => ({ ...x, vsAverage: avg > 0 ? round(x.litres / avg, 2) : 0 }));

  const totals = dailyTotals(data.readings, tz);
  const dailyTrend: { day: string; litres: number }[] = [];
  // Stop at yesterday: today is only partly metered and would look like a sudden drop.
  for (let d = addDays(today, -45); d < today; d = addDays(d, 1)) dailyTrend.push({ day: d, litres: round(totals.get(d) ?? 0) });

  let completeDays = 0;
  let completeLitres = 0;
  for (let d = `${currentMonth}-01`; d < today; d = addDays(d, 1)) {
    if (!totals.has(d)) continue;
    completeDays += 1;
    completeLitres += totals.get(d)!;
  }
  const tankerPerKl = perKl(tot.tc, tot.tl) || perKl(tot.mc + tot.bc + tot.tc, tot.ml + tot.bl + tot.tl);
  const curLitres = cur?.consumedLitres ?? 0;

  return {
    societyId: data.societyId,
    asOf: now.toISOString(),
    currentMonth,
    kpis: {
      litresThisMonth: round(curLitres),
      litresLastMonth: round(prev?.consumedLitres ?? 0),
      costThisMonth: round(cur ? monthCost(cur) : 0),
      costLastMonth: round(prev ? monthCost(prev) : 0),
      costPerKl: perKl(tot.mc + tot.bc + tot.tc, tot.ml + tot.bl + tot.tl),
      openAlerts: data.alerts.filter((a) => !a.resolved).length,
      flats: data.flats.length,
      avgLitresPerFlatPerDay: data.flats.length && completeDays ? round(completeLitres / data.flats.length / completeDays) : 0,
    },
    monthly: months,
    costPerKlBySource: [
      { source: "Municipal", costPerKl: perKl(tot.mc, tot.ml), litres: tot.ml, cost: tot.mc },
      { source: "Borewell", costPerKl: perKl(tot.bc, tot.bl), litres: tot.bl, cost: tot.bc },
      { source: "Tanker", costPerKl: perKl(tot.tc, tot.tl), litres: tot.tl, cost: tot.tc },
    ],
    topFlats,
    dailyTrend,
    forecast: buildForecast(months, addMonths(currentMonth, 1), currentMonth),
    impact: buildImpact(data.alerts, tankerPerKl, now),
  };
}

export interface FlatDetail {
  flat: FlatRec & { label: string };
  monthly: { month: string; litres: number; buildingAvg: number }[];
  daily: { day: string; litres: number; buildingAvg: number }[];
  alerts: AlertRec[];
}

export function buildFlatDetail(data: SocietyData, flatId: string, now = new Date(), tz = DEFAULT_TZ_OFFSET_MIN): FlatDetail | null {
  const flat = data.flats.find((f) => f.id === flatId);
  if (!flat) return null;
  const byMonth = monthlyByFlat(data.readings, tz);
  const totalsByMonth = monthlyTotals(data.readings, tz);
  const flatsN = Math.max(data.flats.length, 1);
  const monthly = [...(byMonth.get(flatId) ?? new Map())]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, litres]) => ({ month, litres: round(litres), buildingAvg: round((totalsByMonth.get(month) ?? 0) / flatsN) }));
  const byDay = dailyByFlat(data.readings, tz).get(flatId) ?? new Map();
  const totalsByDay = dailyTotals(data.readings, tz);
  const today = localDay(now, tz);
  const daily: FlatDetail["daily"] = [];
  for (let d = addDays(today, -60); d <= today; d = addDays(d, 1)) {
    daily.push({ day: d, litres: round(byDay.get(d) ?? 0), buildingAvg: round((totalsByDay.get(d) ?? 0) / flatsN) });
  }
  return {
    flat: { ...flat, label: flatLabel(flat) },
    monthly,
    daily,
    alerts: data.alerts.filter((a) => a.flatId === flatId).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)),
  };
}
