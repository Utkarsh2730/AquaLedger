import { randomUUID } from "node:crypto";
import type { ScheduledEvent } from "aws-lambda";
import { detectLeaks } from "../../../lib/core/leak";
import { computeBills } from "../../../lib/core/billing";
import { monthlyByFlat, round } from "../../../lib/core/aggregate";
import { buildDashboard, monthCost, sourceMonths, type SocietyData } from "../../../lib/core/summary";
import { buildFacts, ruleBasedSummary } from "../../../lib/core/insights";
import { addMonths, localDay, localMonth, monthLabel } from "../../../lib/core/time";
import { batchPut, getSociety, listSocieties, loadSocietyData, putItem, type SocietyRec } from "../shared/db";
import { assertSocietyAdmin, type ResolverEvent } from "../shared/identity";
import { notify } from "../shared/notify";
import { askModel } from "../shared/ai";

type Task = "leaks" | "billing" | "insights" | "all";

export const handler = async (event: ResolverEvent<{ societyId: string; task: Task; month?: string }> | ScheduledEvent) => {
  if ("fieldName" in event) {
    const { societyId, task, month } = event.arguments;
    assertSocietyAdmin(event.identity, societyId);
    const society = await getSociety(societyId);
    if (!society) throw new Error("Society not found");
    return runTasks(society, task, month ?? undefined);
  }

  // EventBridge schedule: nightly leak scan for every society; billing + insights on the 1st.
  const results = [];
  for (const society of await listSocieties()) {
    const tz = society.tzOffsetMinutes ?? 330;
    const firstOfMonth = localDay(new Date(), tz).endsWith("-01");
    try {
      results.push(await runTasks(society, firstOfMonth ? "all" : "leaks"));
    } catch (err) {
      console.error(`analysis failed for ${society.societyId}`, err);
    }
  }
  return results;
};

async function runTasks(society: SocietyRec, task: Task, month?: string) {
  const data = await loadSocietyData(society.societyId);
  const tz = society.tzOffsetMinutes ?? 330;
  const now = new Date();
  const reportMonth = month ?? addMonths(localMonth(now, tz), -1);
  const out: Record<string, unknown> = { societyId: society.societyId, task };
  if (task === "leaks" || task === "all") out.leaks = await runLeakScan(society, data, now, tz);
  if (task === "billing" || task === "all") out.billing = await runBilling(society, data, reportMonth, tz);
  if (task === "insights" || task === "all") out.insights = await runInsights(society, data, reportMonth, now, tz);
  return out;
}

async function runLeakScan(society: SocietyRec, data: SocietyData, now: Date, tz: number) {
  const findings = detectLeaks(data.flats, data.readings, { now, tzOffsetMin: tz });
  // don't re-raise a flat/type that already has an open alert from the last 14 days
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const open = new Set(data.alerts.filter((a) => !a.resolved && a.detectedAt >= since).map((a) => `${a.flatId}#${a.type}`));
  const fresh = findings.filter((f) => !open.has(`${f.flatId}#${f.type}`));
  const detectedAt = now.toISOString();
  await batchPut(
    "Alert",
    fresh.map((f) => ({
      id: randomUUID(),
      societyId: society.societyId,
      flatId: f.flatId,
      flatLabel: f.flatLabel,
      type: f.type,
      severity: f.severity,
      message: f.message,
      detectedAt,
      resolved: false,
    }))
  );
  if (fresh.length) {
    await notify(
      society.societyId,
      `AquaLedger: ${fresh.length} possible leak${fresh.length > 1 ? "s" : ""} at ${society.name}`,
      fresh.map((f) => `• [${f.severity.toUpperCase()}] ${f.message}`).join("\n") + "\n\nOpen AquaLedger → Alerts to review and resolve."
    );
  }
  return { findings: findings.length, newAlerts: fresh.length, flats: fresh.map((f) => `${f.flatLabel} (${f.type})`) };
}

async function runBilling(society: SocietyRec, data: SocietyData, month: string, tz: number) {
  const usage = new Map<string, number>();
  for (const [flatId, months] of monthlyByFlat(data.readings, tz)) usage.set(flatId, months.get(month) ?? 0);
  const src = sourceMonths(data, tz).find((m) => m.month === month);
  const totalWaterCost = src ? monthCost(src) : 0;
  const bills = computeBills({
    societyId: society.societyId,
    month,
    flats: data.flats,
    usage,
    totalWaterCost,
    commonCharge: society.commonCharge ?? 150,
  });
  await batchPut("Bill", bills);
  const total = round(bills.reduce((a, b) => a + b.amount, 0));
  await notify(
    society.societyId,
    `AquaLedger: ${monthLabel(month)} water bills ready for ${society.name}`,
    `${bills.length} usage-based bills were generated for ${monthLabel(month)}.\nTotal water cost: ₹${round(totalWaterCost).toLocaleString("en-IN")}; total billed incl. common charges: ₹${total.toLocaleString("en-IN")}.\nOpen AquaLedger → Bills to review and issue them.`
  );
  return { month, bills: bills.length, totalWaterCost: round(totalWaterCost), totalBilled: total };
}

async function runInsights(society: SocietyRec, data: SocietyData, month: string, now: Date, tz: number) {
  const dash = buildDashboard(data, now, tz);
  const openAlerts = data.alerts.filter((a) => !a.resolved).map((a) => a.message);
  const modelId = process.env.INSIGHT_MODEL_ID || undefined;
  const ai = await askModel(
    modelId,
    buildFacts(dash, { societyName: society.name, openAlerts }),
    `Write the monthly water summary for ${monthLabel(month)} for the society committee in 4-5 plain-English sentences: what changed vs the previous month and why, the biggest cost driver, any leak alerts, and what to do next month (use forecastNextMonth).`
  );
  const summaryText = ai ?? ruleBasedSummary(dash, openAlerts);
  await putItem("Insight", {
    id: `${society.societyId}#${month}`,
    societyId: society.societyId,
    month,
    summaryText,
    forecast: dash.forecast ?? undefined,
    generatedBy: ai ? modelId : "rules",
  });
  return { month, generatedBy: ai ? modelId : "rules", summaryText };
}

