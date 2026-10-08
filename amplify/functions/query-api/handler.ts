import { buildDashboard, buildFlatDetail } from "../../../lib/core/summary";
import { buildFacts, ruleBasedAnswer } from "../../../lib/core/insights";
import type { BillRec } from "../../../lib/core/types";
import { hashAccessCode, isWellFormedAccessCode } from "../../../lib/core/access";
import { findFlatByAccessHash, getSociety, listFlats, listReadings, loadSocietyData, queryAll, T } from "../shared/db";
import { assertSocietyAdmin, type ResolverEvent } from "../shared/identity";
import { aiEnabled, askModel, pingModel } from "../shared/ai";
import { mailStatus } from "../shared/mail";
import { whatsappStatus } from "../shared/whatsapp";
import { subscriptionStatus } from "../shared/notify";

type Args = Record<string, any>;

export const handler = async (event: ResolverEvent<Args>) => {
  const a = event.arguments;
  switch (event.fieldName) {
    case "getDashboard":
      assertSocietyAdmin(event.identity, a.societyId);
      return getDashboard(a.societyId);
    case "getFlatDetail":
      assertSocietyAdmin(event.identity, a.societyId);
      return getFlatDetail(a.societyId, a.flatId);
    case "askWaterData":
      assertSocietyAdmin(event.identity, a.societyId);
      return askWaterData(a.societyId, String(a.question).slice(0, 500));
    case "systemCheck":
      assertSocietyAdmin(event.identity, a.societyId);
      return systemCheck(a.societyId);
    case "residentPortal":
      return residentPortal(String(a.code ?? ""));
    default:
      throw new Error(`Unknown field ${event.fieldName}`);
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
  if (ai.text) return { answer: ai.text, source: "bedrock", model: modelId };
  // fall back to the free rule-based answer; say why, so a misconfigured model is visible
  return { answer: ruleBasedAnswer(question, dash, openAlerts), source: "rules", ...(ai.error ? { aiError: ai.error } : {}) };
}

/**
 * The resident view, for whoever holds the flat's access code: that flat only, plus anonymous
 * building averages; draft bills stay hidden until the committee issues them.
 */
async function residentPortal(rawCode: string) {
  if (!isWellFormedAccessCode(rawCode)) throw new Error("That doesn't look like an access code. It has 12 letters and numbers, like K7M2-QX9P-4HDR.");
  const flat = await findFlatByAccessHash(await hashAccessCode(rawCode));
  if (!flat) throw new Error("Access code not recognised. It may have been replaced: ask your society committee for a new one.");
  const [society, data, bills] = await Promise.all([getSociety(flat.societyId), loadSocietyData(flat.societyId), billsForFlat(flat.id)]);
  const detail = buildFlatDetail(data, flat.id, new Date(), society?.tzOffsetMinutes ?? 330)!;
  return {
    society: { name: society?.name, city: society?.city },
    ...detail,
    flat: { label: detail.flat.label, block: flat.block, number: flat.number },
    bills: bills.filter((b) => b.status !== "draft"),
  };
}

// ---------------------------------------------------------------------------------------------
// System check: tests the deployed backend from the inside, so problems in the live AWS setup show
// up as a readable list (with the fix) instead of silent failures.

type Status = "pass" | "warn" | "fail";
interface Check {
  id: string;
  name: string;
  status: Status;
  detail: string;
  fix?: string;
}

async function check(id: string, name: string, run: () => Promise<Omit<Check, "id" | "name">>): Promise<Check> {
  try {
    return { id, name, ...(await run()) };
  } catch (err) {
    const e = err as { name?: string; message?: string };
    return { id, name, status: "fail", detail: `${e.name ?? "Error"}: ${(e.message ?? String(err)).slice(0, 300)}` };
  }
}

const HOURS = 3_600_000;

async function systemCheck(societyId: string) {
  const society = await getSociety(societyId);
  if (!society) throw new Error("Society not found");
  const now = Date.now();

  const checks = await Promise.all([
    check("database", "Database", async () => {
      const [flats, recent] = await Promise.all([listFlats(societyId), listReadings(societyId, new Date(now - 7 * 24 * HOURS).toISOString())]);
      if (!flats.length) return { status: "warn", detail: "No flats yet.", fix: "Add flats on the Flats page, or load demo data from Settings." };
      const detail = `${flats.length} flats; ${recent.length.toLocaleString("en-IN")} readings in the last 7 days.`;
      return recent.length
        ? { status: "pass", detail }
        : { status: "warn", detail, fix: "No recent readings: leak detection needs them. Add readings or upload a CSV." };
    }),

    check("schedule", "Nightly leak scan", async () => {
      const last = society.lastNightlyScanAt;
      if (!last) {
        return { status: "warn", detail: "Hasn't run yet. It runs every night at 01:15 IST.", fix: "Check again tomorrow. Until then, use “Run analysis now” on the dashboard." };
      }
      const age = (now - Date.parse(last)) / HOURS;
      return age <= 26
        ? { status: "pass", detail: `Last ran ${Math.round(age)} h ago.` }
        : { status: "fail", detail: `Last ran ${Math.round(age / 24)} days ago.`, fix: "The schedule may be disabled: open EventBridge Scheduler in the AWS console and check the analysis function's schedule." };
    }),

    check("emails", "Alert emails", async () => {
      const emails = society.adminEmails ?? [];
      const status = await subscriptionStatus(emails);
      if (!status) return { status: "fail", detail: "No alert topic configured.", fix: "Redeploy the backend (npx ampx sandbox)." };
      const pending = emails.filter((e) => status[e] === "pending");
      const missing = emails.filter((e) => status[e] === "missing");
      const confirmed = emails.filter((e) => status[e] === "confirmed");
      if (!pending.length && !missing.length) return { status: "pass", detail: `Confirmed for ${confirmed.join(", ")}.` };
      return {
        status: confirmed.length ? "warn" : "fail",
        detail: [
          confirmed.length && `Confirmed: ${confirmed.join(", ")}.`,
          pending.length && `Waiting for confirmation: ${pending.join(", ")}.`,
          missing.length && `Not subscribed: ${missing.join(", ")}.`,
        ]
          .filter(Boolean)
          .join(" "),
        fix: pending.length
          ? "Open the “AWS Notification - Subscription Confirmation” email and click Confirm subscription (check spam)."
          : "Invite them again as an admin from Settings to subscribe their email.",
      };
    }),

    check("resident-email", "Resident access emails", async () => {
      const sender = process.env.SENDER_EMAIL;
      if (!sender) {
        return {
          status: "warn",
          detail: "Not set up: share access codes by link or WhatsApp instead.",
          fix: "Set AQUALEDGER_SENDER_EMAIL to an address you own, redeploy, then click the verification link Amazon SES emails to it.",
        };
      }
      const m = await mailStatus();
      if (!m.verified) return { status: "fail", detail: `${sender} isn't verified yet.`, fix: `Open the “Amazon Web Services – Email Address Verification Request” email sent to ${sender} and click the link (check spam).` };
      if (!m.production) {
        return {
          status: "warn",
          detail: `Sending from ${sender}, but Amazon SES is in sandbox mode: it only delivers to verified addresses (max ${m.max24h ?? 200} a day).`,
          fix: "In the AWS console open Amazon SES → Account dashboard → Request production access (say: transactional login emails to residents of housing societies who were registered by their committee). Approval usually takes a day.",
        };
      }
      return { status: "pass", detail: `Sending from ${sender}; ${m.sent24h ?? 0} of ${m.max24h ?? "?"} emails used in the last 24 h.` };
    }),

    check("resident-whatsapp", "Resident WhatsApp", async () => {
      if (!process.env.WHATSAPP_PHONE_ID) {
        return {
          status: "pass",
          detail: "One-tap mode: the committee sends each flat's login from its own WhatsApp. Free, nothing to set up.",
          fix: "Optional: to send automatically, link a WhatsApp Business number in AWS End User Messaging Social and set AQUALEDGER_WHATSAPP_PHONE_ID (see docs/DEPLOY.md).",
        };
      }
      const w = await whatsappStatus();
      const from = `Sending from ${w.number ?? "your WhatsApp Business number"}`;
      if (w.status === "APPROVED") return { status: "pass", detail: `${from} with the approved “${w.template}” template.` };
      if (w.status === "REJECTED") {
        return { status: "fail", detail: `${from}, but Meta rejected the “${w.template}” template.`, fix: "Open the template in AWS End User Messaging Social → WhatsApp → Message templates to see why, edit it, and resubmit." };
      }
      return {
        status: "warn",
        detail: w.submitted
          ? `${from}. Submitted the “${w.template}” message template to Meta for review just now.`
          : `${from}. The “${w.template}” template is ${String(w.status).toLowerCase()} with Meta.`,
        fix: "Meta usually reviews templates within minutes to a day. Until then, the committee's one-tap WhatsApp is used. Run the check again later.",
      };
    }),

    check("meter", "Smart-meter endpoint", async () => {
      const url = process.env.METER_INGEST_URL;
      if (!url) return { status: "fail", detail: "Endpoint URL not configured.", fix: "Redeploy the backend (npx ampx sandbox)." };
      // a request with a wrong token must be rejected: proves the URL is public, reachable and checking tokens
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-token": "system-check-invalid-token" },
        body: JSON.stringify({ societyId, flat: "SYSTEM-CHECK", litres: 0, periodMinutes: 1 }),
        signal: AbortSignal.timeout(8000),
      });
      return res.status === 401
        ? { status: "pass", detail: "Reachable, and rejects readings without the right device token." }
        : { status: "fail", detail: `Expected 401 for a bad token, got HTTP ${res.status}.`, fix: "Check the meter-ingest function URL and its permissions in the Lambda console." };
    }),

    ...[
      ["ai-chat", "AI answers (chat)", process.env.CHAT_MODEL_ID],
      ["ai-insights", "AI monthly summaries", process.env.INSIGHT_MODEL_ID],
    ].map(([id, name, model]) =>
      check(id!, name!, async () => {
        if (!aiEnabled(model)) return { status: "warn", detail: "Switched off: using free rule-based answers.", fix: "Set the model in AQUALEDGER_CHAT_MODEL / AQUALEDGER_INSIGHT_MODEL and redeploy." };
        const started = Date.now();
        const res = await pingModel(model);
        const region = process.env.BEDROCK_REGION || process.env.AWS_REGION;
        if (res.text) return { status: "pass", detail: `${model} in ${region} answered in ${((Date.now() - started) / 1000).toFixed(1)} s.` };
        return {
          status: "fail",
          detail: `${model} in ${region}: ${res.error ?? "no answer"}. Free rule-based answers are used meanwhile.`,
          fix: /access|denied|403|not authorized|subscription/i.test(res.error ?? "")
            ? "In the AWS console open Amazon Bedrock → Model access (in this region) and request access to the Anthropic models; it is usually approved within minutes."
            : /not found|404|invalid model|unsupported/i.test(res.error ?? "")
              ? "This model isn't available in that region. Set AQUALEDGER_BEDROCK_REGION (e.g. us-east-1) or a different model id, then redeploy."
              : "See the error above; it comes straight from Bedrock.",
        };
      })
    ),
  ]);

  const worst: Status = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "pass";
  return { checkedAt: new Date(now).toISOString(), region: process.env.AWS_REGION, overall: worst, checks };
}
