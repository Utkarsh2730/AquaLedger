/**
 * Runs the real Lambda handlers against an in-memory DynamoDB (just the operations and key
 * conditions this app uses), with Cognito stubbed. Catches wiring bugs the pure-logic tests
 * in lib/core can't: wrong index names, item shapes, auth checks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Bedrock as it fails before model access is granted: the app must fall back, not break
vi.mock("@anthropic-ai/bedrock-sdk", () => ({
  AnthropicBedrockMantle: class {
    messages = {
      create: async () => {
        throw Object.assign(new Error("You don't have access to the model with the specified model ID."), { status: 403, name: "PermissionDeniedError" });
      },
    };
  },
}));
import { ddb } from "./shared/db";
import { cognito } from "./shared/identity";
import { sns } from "./shared/notify";
import { ses } from "./shared/mail";
import { whatsapp } from "./shared/whatsapp";
import { handler as adminOps } from "./admin-ops/handler";
import { handler as analysis } from "./analysis/handler";
import { handler as queryApi } from "./query-api/handler";
import { handler as meterIngest } from "./meter-ingest/handler";

const INDEXES: Record<string, Record<string, [string, string?]>> = {
  "FLAT-table": { bySociety: ["societyId"], byAccessCode: ["accessCodeHash"] },
  "READING-table": { bySocietyTime: ["societyId", "timestamp"], byFlatTime: ["flatId", "timestamp"] },
  "TANKER-table": { bySocietyDate: ["societyId", "date"] },
  "SUPPLY-table": { bySocietyDate: ["societyId", "date"] },
  "BILL-table": { bySocietyMonth: ["societyId", "month"], byFlatMonth: ["flatId", "month"] },
  "ALERT-table": { bySocietyDetected: ["societyId", "detectedAt"] },
  "INSIGHT-table": { bySocietyMonth: ["societyId", "month"] },
};
const pk = (table: string) => (table === "SOCIETY-table" ? "societyId" : "id");

let db: Map<string, Map<string, any>>;
/** set to a table name to make the next BatchWrite into it throw (simulates a failure mid-seed) */
let failBatchInto: string | null = null;
const tbl = (t: string) => db.get(t) ?? db.set(t, new Map()).get(t)!;

function fakeSend(cmd: any): any {
  const name = cmd.constructor.name as string;
  const i = cmd.input;
  switch (name) {
    case "PutCommand":
      tbl(i.TableName).set(i.Item[pk(i.TableName)], structuredClone(i.Item));
      return {};
    case "GetCommand":
      return { Item: structuredClone(tbl(i.TableName).get(Object.values(i.Key)[0] as string)) };
    case "UpdateCommand": {
      const item = tbl(i.TableName).get(Object.values(i.Key)[0] as string);
      if (item) {
        const expr = i.UpdateExpression as string;
        for (const [, attr, val] of expr.matchAll(/(\w+) = (:\w+)/g)) item[attr] = i.ExpressionAttributeValues[val];
        const removed = expr.match(/REMOVE (.+)$/)?.[1];
        for (const attr of removed?.split(",").map((a: string) => a.trim()) ?? []) delete item[attr];
      }
      return {};
    }
    case "BatchWriteCommand":
      if (failBatchInto && Object.keys(i.RequestItems).includes(failBatchInto)) {
        failBatchInto = null;
        throw new Error("ProvisionedThroughputExceededException (simulated)");
      }
      for (const [t, reqs] of Object.entries(i.RequestItems) as [string, any[]][]) {
        for (const r of reqs) {
          if (r.PutRequest) tbl(t).set(r.PutRequest.Item[pk(t)], structuredClone(r.PutRequest.Item));
          else tbl(t).delete(Object.values(r.DeleteRequest.Key)[0] as string);
        }
      }
      return { UnprocessedItems: {} };
    case "ScanCommand":
      return { Items: [...tbl(i.TableName).values()] };
    case "QueryCommand": {
      const [hash, range] = INDEXES[i.TableName][i.IndexName];
      const v = i.ExpressionAttributeValues;
      const expr: string = i.KeyConditionExpression;
      let items = [...tbl(i.TableName).values()].filter((it) => it[hash] === v[expr.match(/= (:\w+)/)![1]]);
      if (range) {
        const between = expr.match(/BETWEEN (:\w+) AND (:\w+)/);
        const ge = expr.match(/>= (:\w+)/);
        const eq = expr.match(/AND #\w+ = (:\w+)/);
        if (between) items = items.filter((it) => it[range] >= v[between[1]] && it[range] <= v[between[2]]);
        if (ge) items = items.filter((it) => it[range] >= v[ge[1]]);
        if (eq) items = items.filter((it) => it[range] === v[eq[1]]);
        items.sort((a, b) => String(a[range]).localeCompare(String(b[range])) * (i.ScanIndexForward === false ? -1 : 1));
      }
      return { Items: i.Limit ? items.slice(0, i.Limit) : items };
    }
    default:
      throw new Error(`fake ddb: unsupported ${name}`);
  }
}

const cognitoCalls: string[] = [];
const appsync = (fieldName: string, args: Record<string, unknown>, groups: string[] = []) =>
  ({ typeName: "Mutation", fieldName, arguments: args, identity: { username: "user-1", sub: "user-1", claims: { email: "admin@example.com", "cognito:groups": groups } } }) as any;

beforeEach(() => {
  db = new Map();
  failBatchInto = null;
  cognitoCalls.length = 0;
  vi.useRealTimers();
  vi.spyOn(ddb, "send").mockImplementation(async (cmd: any) => fakeSend(cmd));
  vi.spyOn(cognito, "send").mockImplementation(async (cmd: any) => {
    cognitoCalls.push(cmd.constructor.name);
    return {};
  });
});

describe("sending residents their login", () => {
  async function setup() {
    const created: any = await adminOps(appsync("setupSociety", { name: "Green <Meadows>", blocks: ["a"], flatsPerBlock: 6 }));
    const sid = created.societyId;
    const admin = [sid, "ADMINS"];
    const flat = (n: string) => [...tbl("FLAT-table").values()].find((f) => `${f.block}-${f.number}` === n);
    const send = (flatIds: string[], extra: Record<string, unknown> = {}, groups = admin) =>
      adminOps(appsync("sendResidentAccess", { societyId: sid, flatIds, origin: "https://aqua.example/", ...extra }, groups)) as Promise<any>;
    const guest = (code: string) => queryApi({ typeName: "Query", fieldName: "residentPortal", arguments: { code }, identity: null } as any) as Promise<any>;
    return { sid, admin, flat, send, guest };
  }
  const byFlat = (res: any) => Object.fromEntries(res.results.map((r: any) => [r.flat, r]));

  it("emails each listed flat a fresh code, skips or restores as it should", async () => {
    const { sid, admin, flat, send, guest } = await setup();
    const [f1, f2, f3, f4] = ["A-101", "A-102", "A-201", "A-202"].map(flat);
    f1.residentEmails = ["rahul@example.com", "priya@example.com"];
    f2.residentEmails = ["bounce@example.com"];
    f4.residentEmails = ["old@example.com"];
    const before = (await adminOps(appsync("issueResidentAccess", { societyId: sid, flatId: f2.id }, admin))) as any;
    await adminOps(appsync("issueResidentAccess", { societyId: sid, flatId: f4.id }, admin));
    const f2Hash = tbl("FLAT-table").get(f2.id).accessCodeHash;
    const ids = [f1.id, f2.id, f3.id, f4.id];

    // without SES, emails can't go out: those flats are skipped, nothing changes
    delete process.env.SENDER_EMAIL;
    expect(byFlat(await send([f1.id]))["A-101"]).toMatchObject({ status: "skipped", reason: "Only emails on file, and email sending isn't set up" });
    expect(tbl("FLAT-table").get(f1.id).accessCodeHash).toBeUndefined();
    process.env.SENDER_EMAIL = "committee@aqua.example";

    const sent: { to: string; subject: string; text: string }[] = [];
    vi.spyOn(ses, "send").mockImplementation(async (cmd: any) => {
      const to = cmd.input.Destination.ToAddresses[0];
      if (to.startsWith("bounce")) throw Object.assign(new Error(`Email address is not verified. The following identities failed the check in region AP-SOUTH-1: ${to}`), { name: "MessageRejected" });
      sent.push({ to, subject: cmd.input.Content.Simple.Subject.Data, text: cmd.input.Content.Simple.Body.Text.Data });
      return {};
    });
    try {
      await expect(send(ids, {}, ["other"])).rejects.toThrow(/Unauthorized/);
      await expect(send(ids, { origin: "javascript:alert(1)" })).rejects.toThrow(/Invalid site/);

      // f2 already has access but replaceExisting forces a new code, whose send then fails
      const by = byFlat(await send(ids, { replaceExisting: true }));
      expect(by["A-101"]).toMatchObject({ status: "sent", sentTo: ["rahul@example.com", "priya@example.com"] });
      expect(by["A-101"].code).toBeUndefined(); // only returned when the committee must send it by hand
      expect(by["A-102"].status).toBe("failed");
      expect(by["A-102"].reason).toMatch(/sandbox/);
      expect(by["A-201"]).toMatchObject({ status: "skipped", reason: "No email or mobile on file" });
      expect(by["A-202"].status).toBe("sent");
      // a failed send keeps the old code working
      expect(tbl("FLAT-table").get(f2.id).accessCodeHash).toBe(f2Hash);
      expect((await guest(before.code)).flat.label).toBe("A-102");

      // the email carries a working code for that flat, and both residents got the same one
      const mail = sent.find((m) => m.to === "rahul@example.com")!;
      expect(mail.subject).toBe("Your AquaLedger login for flat A-101 · Green <Meadows>");
      const code = mail.text.match(/Access code:\s+(\S+)/)![1];
      expect(sent.find((m) => m.to === "priya@example.com")!.text).toContain(code);
      expect(mail.text).toContain(`https://aqua.example/resident/?code=${code}`);
      expect((await guest(code)).flat.label).toBe("A-101");

      // without replaceExisting, flats that have access are left alone
      sent.length = 0;
      const again = await send(ids);
      expect(again.results.filter((r: any) => r.status === "skipped" && r.reason === "Already has access").map((r: any) => r.flat)).toEqual(["A-101", "A-102", "A-202"]);
      expect(sent).toHaveLength(0);
    } finally {
      delete process.env.SENDER_EMAIL;
    }
  });

  it("WhatsApp: automatic when set up, otherwise one tap per number from the committee's phone", async () => {
    const { flat, send, guest } = await setup();
    const [f1, f2, f3] = ["A-101", "A-102", "A-201"].map(flat);
    f1.residentPhones = ["+919876543210", "+919123456789"];
    f2.residentPhones = ["+919000000000"];
    f3.residentPhones = ["+919811122233"];
    f3.residentEmails = ["f3@example.com"]; // email isn't set up in this test: phones still work

    // one-tap mode (no WhatsApp Business number): the code comes back for the committee to send
    const manual = byFlat(await send([f1.id]));
    expect(manual["A-101"]).toMatchObject({ status: "manual", sentTo: [], manualPhones: ["+919876543210", "+919123456789"] });
    expect((await guest(manual["A-101"].code)).flat.label).toBe("A-101");

    // automatic mode
    process.env.WHATSAPP_PHONE_ID = "phone-number-id-test";
    const messages: any[] = [];
    vi.spyOn(whatsapp, "send").mockImplementation(async (cmd: any) => {
      expect(cmd.input.originationPhoneNumberId).toBe("phone-number-id-test");
      const msg = JSON.parse(new TextDecoder().decode(cmd.input.message));
      if (msg.to === "+919000000000") throw Object.assign(new Error("(#131026) Message undeliverable: recipient is not a valid WhatsApp user"), { name: "ValidationException" });
      messages.push(msg);
      return {};
    });
    try {
      const auto = byFlat(await send([f1.id, f2.id, f3.id], { replaceExisting: true }));
      expect(auto["A-101"]).toMatchObject({ status: "sent", sentTo: ["+919876543210", "+919123456789"] });
      expect(auto["A-101"].code).toBeUndefined();
      // a number WhatsApp rejects falls back to the committee's one tap, with the reason
      expect(auto["A-102"]).toMatchObject({ status: "manual", manualPhones: ["+919000000000"] });
      expect(auto["A-102"].reason).toMatch(/isn't on WhatsApp/);
      expect(auto["A-201"].sentTo).toEqual(["+919811122233"]);
      const m = messages.find((x) => x.to === "+919876543210");
      expect(m.template.name).toBe("aqualedger_login");
      const [society, flatLabel, code, link] = m.template.components[0].parameters.map((p: any) => p.text);
      expect([society, flatLabel]).toEqual(["Green <Meadows>", "A-101"]);
      expect(link).toBe(`https://aqua.example/resident/?code=${code}`);
      expect((await guest(code)).flat.label).toBe("A-101");
      await expect(guest(manual["A-101"].code)).rejects.toThrow(/not recognised/); // replaced
    } finally {
      delete process.env.WHATSAPP_PHONE_ID;
    }
  });
});

describe("giving every flat access at once", () => {
  it("issues a code to each flat, sends where it can, and returns every code to the committee", async () => {
    const created: any = await adminOps(appsync("setupSociety", { name: "Green Meadows", blocks: ["a"], flatsPerBlock: 4 }));
    const sid = created.societyId;
    const admin = [sid, "ADMINS"];
    const flats = [...tbl("FLAT-table").values()].sort((x, y) => x.number.localeCompare(y.number));
    flats[0].residentPhones = ["+919876543210"];
    flats[1].residentEmails = ["only-email@example.com"]; // email isn't set up here
    const all = (extra = {}) =>
      adminOps(appsync("sendResidentAccess", { societyId: sid, flatIds: flats.map((f) => f.id), origin: "https://aqua.example", includeUncontacted: true, returnCodes: true, ...extra }, admin)) as Promise<any>;

    const res = await all();
    expect(res.results.map((r: any) => r.status)).toEqual(["manual", "issued", "issued", "issued"]);
    for (const r of res.results) {
      const portal: any = await queryApi({ typeName: "Query", fieldName: "residentPortal", arguments: { code: r.code }, identity: null } as any);
      expect(portal.flat.label).toBe(r.flat);
    }
    // running it again leaves them alone, unless asked to replace
    expect((await all()).results.every((r: any) => r.status === "skipped" && r.reason === "Already has access")).toBe(true);
    expect((await all({ replaceExisting: true })).results.every((r: any) => r.code)).toBe(true);
  });
});

describe("end-to-end through the Lambda handlers", () => {
  it("onboards a society with demo data, finds the planted leak, bills and answers questions", async () => {
    const created: any = await adminOps(appsync("setupSociety", { name: "Green Meadows", city: "Pune", blocks: ["a", "b", "c", "d"], flatsPerBlock: 10, seedDemo: true }));
    expect(created.flats).toBe(40);
    expect(created.leakFlat).toBe("B-202");
    expect(cognitoCalls).toEqual(["CreateGroupCommand", "AdminAddUserToGroupCommand", "AdminAddUserToGroupCommand"]);
    const sid = created.societyId;
    const admin = [sid, "ADMINS"];

    // tenant isolation: another user's token can't touch this society
    await expect(queryApi(appsync("getDashboard", { societyId: sid }, ["other-society"]))).rejects.toThrow(/Unauthorized/);

    const leaks: any = await analysis(appsync("runAnalysis", { societyId: sid, task: "leaks" }, admin));
    expect(leaks.leaks.newAlerts).toBe(2);
    expect(leaks.leaks.flats.sort()).toEqual(["B-202 (night_flow)", "B-202 (spike)"]);
    // re-running doesn't duplicate open alerts
    const again: any = await analysis(appsync("runAnalysis", { societyId: sid, task: "leaks" }, admin));
    expect(again.leaks.newAlerts).toBe(0);

    const billing: any = await analysis(appsync("runAnalysis", { societyId: sid, task: "all" }, admin));
    expect(billing.billing.bills).toBe(40);
    const bills = [...tbl("BILL-table").values()];
    const totalUsage = bills.reduce((a, b) => a + b.usageCharge, 0);
    expect(totalUsage).toBeCloseTo(billing.billing.totalWaterCost, 0);
    expect(billing.insights.generatedBy).toBe("rules");

    const dash: any = await queryApi(appsync("getDashboard", { societyId: sid }, admin));
    expect(dash.dashboard.kpis.flats).toBe(40);
    expect(dash.dashboard.kpis.openAlerts).toBe(2);
    expect(dash.insight.summaryText.length).toBeGreaterThan(50);

    const chat: any = await queryApi(appsync("askWaterData", { societyId: sid, question: "Why did our bill go up this month?" }, admin));
    expect(chat.source).toBe("rules");
    expect(chat.answer).toMatch(/Total water cost/);

    const leakFlatId = [...tbl("FLAT-table").values()].find((f) => f.block === "B" && f.number === "202").id;
    const detail: any = await queryApi(appsync("getFlatDetail", { societyId: sid, flatId: leakFlatId }, admin));
    expect(detail.alerts).toHaveLength(2);
    expect(detail.bills).toHaveLength(1);

    // resident access: the committee issues a code; anyone holding it sees that flat only, no account
    const guest = (code: string) => queryApi({ typeName: "Query", fieldName: "residentPortal", arguments: { code }, identity: { cognitoIdentityId: "ap-south-1:guest" } } as any) as Promise<any>;
    const issued: any = await adminOps(appsync("issueResidentAccess", { societyId: sid, flatId: leakFlatId }, admin));
    expect(issued.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(issued.flat).toBe("B-202");
    const stored = tbl("FLAT-table").get(leakFlatId);
    expect(stored.accessCodeHash).toMatch(/^[0-9a-f]{64}$/); // only the hash is stored
    expect(JSON.stringify(stored)).not.toContain(issued.code.replace(/-/g, ""));
    const resident = await guest(issued.code.toLowerCase().replace(/-/g, " ")); // forgiving input
    expect(resident.flat.label).toBe("B-202");
    expect(resident.society.name).toBe("Green Meadows");
    expect(resident.bills).toHaveLength(0); // drafts are hidden from residents
    expect(resident.email).toBeUndefined();
    await expect(guest("K7M2-QX9P-4HDR")).rejects.toThrow(/not recognised/);
    await expect(guest("1234")).rejects.toThrow(/doesn't look like an access code/);
    // other committees can't issue codes for this society's flats
    await expect(adminOps(appsync("issueResidentAccess", { societyId: sid, flatId: leakFlatId }, ["other"]))).rejects.toThrow(/Unauthorized/);
    // re-issuing replaces the old code; revoking ends access
    const second: any = await adminOps(appsync("issueResidentAccess", { societyId: sid, flatId: leakFlatId }, admin));
    await expect(guest(issued.code)).rejects.toThrow(/not recognised/);
    expect((await guest(second.code)).flat.label).toBe("B-202");
    await adminOps(appsync("revokeResidentAccess", { societyId: sid, flatId: leakFlatId }, admin));
    await expect(guest(second.code)).rejects.toThrow(/not recognised/);
    expect(tbl("FLAT-table").get(leakFlatId).accessCodeHash).toBeUndefined();

    // a second committee member becomes admin of the same society
    cognitoCalls.length = 0;
    const co: any = await adminOps(appsync("inviteAdmin", { societyId: sid, email: "Treasurer@Example.com" }, admin));
    expect(co.adminEmails).toEqual(["admin@example.com", "treasurer@example.com"]);
    expect(cognitoCalls).toEqual(["AdminCreateUserCommand", "AdminAddUserToGroupCommand", "AdminAddUserToGroupCommand"]);
    await expect(adminOps(appsync("inviteAdmin", { societyId: sid, email: "x@example.com" }, ["other"]))).rejects.toThrow(/Unauthorized/);

    // leak impact: the planted leak is valued at tanker prices
    const impact = (await queryApi(appsync("getDashboard", { societyId: sid }, admin)) as any).dashboard.impact;
    expect(impact).toMatchObject({ leaksCaught: 1, open: 1, fixed: 0 });
    expect(impact.litresPerMonth).toBeGreaterThan(10_000);
    expect(impact.rupeesPerMonth).toBeGreaterThan(1_000);

    // CSV import
    const csv: any = await adminOps(appsync("importReadingsCsv", { societyId: sid, csv: "flat,date,litres\nA-101,2026-10-01,400\nZ-1,2026-10-01,3" }, admin));
    expect(csv).toMatchObject({ imported: 1, errorCount: 1 });
  });

  it("does not make the user admin of a half-built society when seeding fails", async () => {
    failBatchInto = "READING-table";
    await expect(adminOps(appsync("setupSociety", { name: "S", blocks: ["A"], flatsPerBlock: 4, seedDemo: true }))).rejects.toThrow(/simulated/);
    expect(cognitoCalls).toEqual([]); // no group created, user not added: retrying is clean
    const ok: any = await adminOps(appsync("setupSociety", { name: "S", blocks: ["A"], flatsPerBlock: 4, seedDemo: true }));
    expect(ok.seeded).toBe(true);
    expect(cognitoCalls).toEqual(["CreateGroupCommand", "AdminAddUserToGroupCommand", "AdminAddUserToGroupCommand"]);
  });

  it("finds the planted leak when the demo is presented days after seeding", async () => {
    const created: any = await adminOps(appsync("setupSociety", { name: "S", blocks: ["A", "B", "C", "D"], flatsPerBlock: 10, seedDemo: true }));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 4 * 86_400_000);
    const res: any = await analysis(appsync("runAnalysis", { societyId: created.societyId, task: "leaks" }, [created.societyId]));
    expect(res.leaks.flats.sort()).toEqual(["B-202 (night_flow)", "B-202 (spike)"]);
  });

  it("never resets bills the committee already issued or marked paid", async () => {
    const created: any = await adminOps(appsync("setupSociety", { name: "S", blocks: ["A", "B"], flatsPerBlock: 4, seedDemo: true }));
    const admin = [created.societyId];
    await analysis(appsync("runAnalysis", { societyId: created.societyId, task: "billing" }, admin));
    const bills = [...tbl("BILL-table").values()];
    bills[0].status = "paid";
    bills[1].status = "issued";
    const amount0 = bills[0].amount;
    bills[0].amount = 1; // pretend it was edited/paid at an older amount
    const again: any = await analysis(appsync("runAnalysis", { societyId: created.societyId, task: "billing" }, admin));
    expect(again.billing.kept).toBe(2);
    expect(tbl("BILL-table").get(bills[0].id)).toMatchObject({ status: "paid", amount: 1 });
    expect(tbl("BILL-table").get(bills[1].id).status).toBe("issued");
    expect(tbl("BILL-table").get(bills[2].id).status).toBe("draft");
    expect(amount0).toBeGreaterThan(1);
  });

  it("system check reports each part of the backend, with fixes", async () => {
    const created: any = await adminOps(appsync("setupSociety", { name: "S", blocks: ["A", "B", "C", "D"], flatsPerBlock: 10, seedDemo: true }));
    const sid = created.societyId;
    await adminOps(appsync("inviteAdmin", { societyId: sid, email: "treasurer@example.com" }, [sid]));

    process.env.ALERTS_TOPIC_ARN = "arn:aws:sns:ap-south-1:1:alerts";
    process.env.METER_INGEST_URL = "https://meter.example/";
    process.env.CHAT_MODEL_ID = "anthropic.claude-sonnet-5-5";
    process.env.INSIGHT_MODEL_ID = "off";
    vi.spyOn(sns, "send").mockImplementation(async (cmd: any) =>
      cmd.constructor.name === "ListSubscriptionsByTopicCommand"
        ? {
            Subscriptions: [
              { Protocol: "email", Endpoint: "Admin@example.com", SubscriptionArn: "arn:aws:sns:ap-south-1:1:alerts:abc" },
              { Protocol: "email", Endpoint: "treasurer@example.com", SubscriptionArn: "PendingConfirmation" },
            ],
          }
        : {}
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    try {
      const res: any = await queryApi(appsync("systemCheck", { societyId: sid }, [sid]));
      const by = Object.fromEntries(res.checks.map((c: any) => [c.id, c]));
      expect(by.database.status).toBe("pass");
      expect(by.schedule.status).toBe("warn"); // never ran yet
      expect(by.emails).toMatchObject({ status: "warn" });
      expect(by.emails.detail).toMatch(/Waiting for confirmation: treasurer@example.com/);
      expect(by.meter.status).toBe("pass");
      expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({ "x-device-token": "system-check-invalid-token" });
      expect(by["ai-chat"].status).toBe("fail");
      expect(by["ai-chat"].fix).toMatch(/Model access/);
      expect(by["ai-insights"].status).toBe("warn");
      expect(res.overall).toBe("fail");
      await expect(queryApi(appsync("systemCheck", { societyId: sid }, ["other"]))).rejects.toThrow(/Unauthorized/);

      // chat still answers, from the rules, and says why the AI wasn't used
      const chat: any = await queryApi(appsync("askWaterData", { societyId: sid, question: "Why did our bill go up this month?" }, [sid]));
      expect(chat).toMatchObject({ source: "rules" });
      expect(chat.aiError).toMatch(/403 PermissionDeniedError/);

      // the scheduled run records itself, which turns the schedule check green
      await analysis({ "detail-type": "Scheduled Event", source: "aws.scheduler" } as any);
      expect(tbl("SOCIETY-table").get(sid).lastNightlyScanAt).toBeTruthy();
      const again: any = await queryApi(appsync("systemCheck", { societyId: sid }, [sid]));
      expect(again.checks.find((c: any) => c.id === "schedule").status).toBe("pass");
    } finally {
      delete process.env.ALERTS_TOPIC_ARN;
      delete process.env.METER_INGEST_URL;
      delete process.env.CHAT_MODEL_ID;
      delete process.env.INSIGHT_MODEL_ID;
      fetchSpy.mockRestore();
    }
  });

  it("meter endpoint rejects oversized, implausible and stale readings", async () => {
    const created: any = await adminOps(appsync("setupSociety", { name: "S", blocks: ["A"], flatsPerBlock: 2, seedDemo: false }));
    const token = tbl("SOCIETY-table").get(created.societyId).deviceToken;
    const post = (body: object | string) =>
      meterIngest({
        requestContext: { http: { method: "POST" } },
        headers: { "x-device-token": token },
        body: typeof body === "string" ? body : JSON.stringify(body),
      } as any) as Promise<any>;
    const base = { societyId: created.societyId, flat: "A-101", periodMinutes: 1 };
    expect((await post("x".repeat(5000))).statusCode).toBe(413);
    expect((await post({ ...base, litres: 5000 })).statusCode).toBe(400);
    expect((await post({ ...base, litres: 3, timestamp: "2020-01-01T00:00:00Z" })).statusCode).toBe(400);
    expect((await post({ ...base, litres: 3, timestamp: new Date(Date.now() + 3_600_000).toISOString() })).statusCode).toBe(400);
    expect((await post({ ...base, litres: 0.5 })).statusCode).toBe(200);
  });

  it("raises a live alert from the meter ingest URL when a tap is left open", async () => {
    const created: any = await adminOps(appsync("setupSociety", { name: "S", blocks: ["A", "B", "C", "D"], flatsPerBlock: 10, seedDemo: true }));
    const token = tbl("SOCIETY-table").get(created.societyId).deviceToken;
    const post = (litres: number, tok = token) =>
      meterIngest({
        requestContext: { http: { method: "POST" } },
        headers: { "x-device-token": tok },
        body: JSON.stringify({ societyId: created.societyId, flat: "C-301", litres, periodMinutes: 1 }),
      } as any) as Promise<any>;

    expect((await post(12, "wrong")).statusCode).toBe(401);
    const normal = JSON.parse((await post(0.4)).body);
    expect(normal.alert).toBeNull();
    const leak = JSON.parse((await post(12)).body);
    expect(leak.alert).toMatch(/C-301 is drawing 12 L\/min/);
    const dup = JSON.parse((await post(12)).body);
    expect(dup.alert).toBe("already-open");
    expect([...tbl("ALERT-table").values()].filter((a) => a.type === "live_spike")).toHaveLength(1);
  });
});
