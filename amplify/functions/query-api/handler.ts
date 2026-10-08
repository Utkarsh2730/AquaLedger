import type { AppSyncResolverEvent } from "aws-lambda";
import { buildDashboard, buildFlatDetail } from "../../../lib/core/summary";
import { buildFacts, ruleBasedAnswer } from "../../../lib/core/insights";
import type { BillRec, FlatRec } from "../../../lib/core/types";
import { getSociety, loadSocietyData, queryAll, T } from "../shared/db";
import { assertSocietyAdmin, emailOf } from "../shared/identity";
import { askModel } from "../shared/ai";

type Args = Record<string, any>;

export const handler = async (event: AppSyncResolverEvent<Args>) => {
  const a = event.arguments;
  switch (event.info.fieldName) {
    case "getDashboard":
      assertSocietyAdmin(event.identity, a.societyId);
      return getDashboard(a.societyId);
    case "getFlatDetail":
      assertSocietyAdmin(event.identity, a.societyId);
      return getFlatDetail(a.societyId, a.flatId);
    case "askWaterData":
      assertSocietyAdmin(event.identity, a.societyId);
      return askWaterData(a.societyId, String(a.question).slice(0, 500));
    case "myResidentPortal":
      return residentPortal(await emailOf(event.identity));
    default:
      throw new Error(`Unknown field ${event.info.fieldName}`);
  }
};

async function latestInsight(societyId: string) {
  const items = await queryAll<{ month: string; summaryText: string; generatedBy: string }>({
    TableName: T.Insight,
    IndexName: "bySocietyMonth",
    KeyConditionExpression: "societyId = :s",
    ExpressionAttributeValues: { ":s": societyId },
    ScanIndexForward: false,
    Limit: 1,
  });
  return items[0] ?? null;
}

const billsForFlat = (flatId: string) =>
  queryAll<BillRec>({
    TableName: T.Bill,
    IndexName: "byFlatMonth",
    KeyConditionExpression: "flatId = :f",
    ExpressionAttributeValues: { ":f": flatId },
    ScanIndexForward: false,
  });

async function getDashboard(societyId: string) {
  const [society, data, insight] = await Promise.all([getSociety(societyId), loadSocietyData(societyId), latestInsight(societyId)]);
  const dashboard = buildDashboard(data, new Date(), society?.tzOffsetMinutes ?? 330);
  return { society: { name: society?.name, city: society?.city }, dashboard, insight };
}

async function getFlatDetail(societyId: string, flatId: string) {
  const [society, data, bills] = await Promise.all([getSociety(societyId), loadSocietyData(societyId), billsForFlat(flatId)]);
  const detail = buildFlatDetail(data, flatId, new Date(), society?.tzOffsetMinutes ?? 330);
  if (!detail) throw new Error("Flat not found");
  return { ...detail, bills: bills.filter((b) => b.societyId === societyId) };
}

async function askWaterData(societyId: string, question: string) {
  const [society, data] = await Promise.all([getSociety(societyId), loadSocietyData(societyId)]);
  const dash = buildDashboard(data, new Date(), society?.tzOffsetMinutes ?? 330);
  const openAlerts = data.alerts.filter((x) => !x.resolved).map((x) => x.message);
  const modelId = process.env.CHAT_MODEL_ID || undefined;
  const ai = await askModel(modelId, buildFacts(dash, { societyName: society?.name, openAlerts }), question);
  return ai ? { answer: ai, source: "bedrock", model: modelId } : { answer: ruleBasedAnswer(question, dash, openAlerts), source: "rules" };
}

/** Residents only ever see their own flat plus anonymous building averages. */
async function residentPortal(email: string) {
  const flats = await queryAll<FlatRec>({
    TableName: T.Flat,
    IndexName: "byResidentEmail",
    KeyConditionExpression: "residentEmail = :e",
    ExpressionAttributeValues: { ":e": email },
  });
  const flat = flats[0];
  if (!flat) return { email, flat: null };
  const [society, data, bills] = await Promise.all([getSociety(flat.societyId), loadSocietyData(flat.societyId), billsForFlat(flat.id)]);
  const detail = buildFlatDetail(data, flat.id, new Date(), society?.tzOffsetMinutes ?? 330)!;
  return {
    email,
    society: { name: society?.name, city: society?.city },
    ...detail,
    flat: { label: detail.flat.label, block: flat.block, number: flat.number },
    bills: bills.filter((b) => b.status !== "draft"),
  };
}
