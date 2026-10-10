import { randomUUID } from "node:crypto";
import type { ScheduledEvent } from "aws-lambda";
import { planBilling, planLeakAlerts } from "../../../lib/core/jobs";
import { buildDashboard, type SocietyData } from "../../../lib/core/summary";
import { ruleBasedSummary } from "../../../lib/core/insights";
import { addMonths, localDay, localMonth, monthLabel } from "../../../lib/core/time";
import { batchPut, getSociety, listBillsForMonth, listSocieties, loadSocietyData, markNightlyScan, putItem, type SocietyRec } from "../shared/db";
import { assertSocietyAdmin, type ResolverEvent } from "../shared/identity";
import { notify } from "../shared/notify";

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
      await markNightlyScan(society.societyId);
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
  const { alerts, summary } = planLeakAlerts(data, now, tz, randomUUID);
  await batchPut("Alert", alerts);
  if (alerts.length) {
    await notify(
      society.societyId,
      `AquaLedger: ${alerts.length} possible leak${alerts.length > 1 ? "s" : ""} at ${society.name}`,
      alerts.map((a) => `• [${a.severity.toUpperCase()}] ${a.message}`).join("\n") + "\n\nOpen AquaLedger → Alerts to review and resolve."
    );
  }
  return summary;
}

async function runBilling(society: SocietyRec, data: SocietyData, month: string, tz: number) {
  const existing = await listBillsForMonth(society.societyId, month);
  const { toWrite, summary } = planBilling(data, month, society.commonCharge ?? 150, tz, existing);
  await batchPut("Bill", toWrite);
  await notify(
    society.societyId,
    `AquaLedger: ${monthLabel(month)} water bills ready for ${society.name}`,
    `${summary.bills} usage-based bills were generated for ${monthLabel(month)}.\nTotal water cost: ₹${summary.totalWaterCost.toLocaleString("en-IN")}; total billed incl. common charges: ₹${summary.totalBilled.toLocaleString("en-IN")}.\nOpen AquaLedger → Bills to review and issue them.`
  );
  return summary;
}

async function runInsights(society: SocietyRec, data: SocietyData, month: string, now: Date, tz: number) {
  const dash = buildDashboard(data, now, tz);
  const openAlerts = data.alerts.filter((a) => !a.resolved).map((a) => a.message);
  const summaryText = ruleBasedSummary(dash, openAlerts);
  const generatedBy = "rules";
  await putItem("Insight", {
    id: `${society.societyId}#${month}`,
    societyId: society.societyId,
    month,
    summaryText,
    forecast: dash.forecast ?? undefined,
    generatedBy,
  });
  return { month, generatedBy, summaryText };
}

