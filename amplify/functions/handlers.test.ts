/**
 * Runs the real Lambda handlers against an in-memory DynamoDB (just the operations and key
 * conditions this app uses), with Cognito stubbed. Catches wiring bugs the pure-logic tests
 * in lib/core can't: wrong index names, item shapes, auth checks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ddb } from "./shared/db";
import { cognito } from "./shared/identity";
import { handler as adminOps } from "./admin-ops/handler";
import { handler as analysis } from "./analysis/handler";
import { handler as queryApi } from "./query-api/handler";
import { handler as meterIngest } from "./meter-ingest/handler";

const INDEXES: Record<string, Record<string, [string, string?]>> = {
  "FLAT-table": { bySociety: ["societyId"], byResidentEmail: ["residentEmail"] },
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
      return { Item: tbl(i.TableName).get(Object.values(i.Key)[0] as string) };
    case "UpdateCommand": {
      const item = tbl(i.TableName).get(Object.values(i.Key)[0] as string);
      if (item) {
        for (const [, attr, val] of (i.UpdateExpression as string).matchAll(/(\w+) = (:\w+)/g)) item[attr] = i.ExpressionAttributeValues[val];
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

    // resident portal: invite then read as the resident
    await adminOps(appsync("inviteResident", { societyId: sid, flatId: leakFlatId, email: "Resident@Example.com" }, admin));
    const resident: any = await queryApi({ ...appsync("myResidentPortal", {}), identity: { username: "r", claims: { email: "resident@example.com" } } } as any);
    expect(resident.flat.label).toBe("B-202");
    expect(resident.bills).toHaveLength(0); // drafts are hidden from residents

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
