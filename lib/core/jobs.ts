/**
 * The analysis jobs as pure functions: given a society's data, decide which alerts to raise
 * and which bills to write. The analysis Lambda persists the result to DynamoDB; the offline
 * demo mode persists it in memory. Keeping one copy means both behave identically.
 */
import { computeBills } from "./billing";
import { detectLeaks, pickTargetDay } from "./leak";
import { monthlyByFlat, round } from "./aggregate";
import { monthCost, sourceMonths, type SocietyData } from "./summary";
import type { AlertRec, BillRec } from "./types";

export function planLeakAlerts(data: SocietyData, now: Date, tz: number, newId: () => string) {
  const targetDay = pickTargetDay(data.readings, now, tz);
  const findings = detectLeaks(data.flats, data.readings, { now, targetDay, tzOffsetMin: tz });
  // don't re-raise a flat/type that already has an open alert from the last 14 days
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const open = new Set(data.alerts.filter((a) => !a.resolved && a.detectedAt >= since).map((a) => `${a.flatId}#${a.type}`));
  const fresh = findings.filter((f) => !open.has(`${f.flatId}#${f.type}`));
  const detectedAt = now.toISOString();
  const alerts: AlertRec[] = fresh.map((f) => ({
    id: newId(),
    societyId: data.societyId,
    flatId: f.flatId,
    flatLabel: f.flatLabel,
    type: f.type,
    severity: f.severity,
    message: f.message,
    detectedAt,
    resolved: false,
    wasteLitresPerDay: f.wasteLitresPerDay,
  }));
  return {
    alerts,
    summary: { targetDay, findings: findings.length, newAlerts: alerts.length, flats: alerts.map((a) => `${a.flatLabel} (${a.type})`) },
  };
}

export function planBilling(data: SocietyData, month: string, commonCharge: number, tz: number, existing: Pick<BillRec, "id" | "status">[]) {
  const usage = new Map<string, number>();
  for (const [flatId, months] of monthlyByFlat(data.readings, tz)) usage.set(flatId, months.get(month) ?? 0);
  const src = sourceMonths(data, tz).find((m) => m.month === month);
  const totalWaterCost = src ? monthCost(src) : 0;
  const bills = computeBills({ societyId: data.societyId, month, flats: data.flats, usage, totalWaterCost, commonCharge });
  // Bills the committee already issued or marked paid are final: re-running only refreshes drafts.
  const locked = new Set(existing.filter((b) => b.status && b.status !== "draft").map((b) => b.id));
  const total = round(bills.reduce((a, b) => a + b.amount, 0));
  return {
    toWrite: bills.filter((b) => !locked.has(b.id)),
    summary: { month, bills: bills.length, kept: locked.size, totalWaterCost: round(totalWaterCost), totalBilled: total },
  };
}
