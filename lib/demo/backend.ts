/**
 * Offline demo mode (`npm run demo`): the whole app runs in the browser against this in-memory
 * stand-in for AppSync + the Lambdas, with no AWS account, login or network. It reuses the same
 * lib/core logic as the real backend (seed data, leak rules, billing, forecast, chat answers).
 *
 * Use it as the stage backup if Wi-Fi or AWS fails, and for clicking through the UI locally.
 * Changes are kept in this browser's localStorage (the 14k generated readings are rebuilt from
 * the seed instead of stored); Settings → Reset demo data starts over.
 */
import { generateSeed } from "@/lib/core/seed";
import { planBilling, planLeakAlerts } from "@/lib/core/jobs";
import { buildDashboard, buildFlatDetail, type SocietyData } from "@/lib/core/summary";
import { ruleBasedAnswer, ruleBasedSummary } from "@/lib/core/insights";
import { parseReadingsCsv } from "@/lib/core/csv";
import { detectLiveSpike } from "@/lib/core/leak";
import { addMonths, localMonth } from "@/lib/core/time";
import { flatLabel, type AlertRec, type BillRec, type FlatRec, type ReadingRec, type SupplyRec, type TankerRec } from "@/lib/core/types";

export const DEMO_SOCIETY_ID = "demo-society";
export const DEMO_EMAIL = "committee@demo.aqualedger";
export const DEMO_RESIDENT_FLAT = "B-202";
const TZ = 330;

type Row = { id: string; createdAt: string; updatedAt: string; [k: string]: any };
interface Society {
  societyId: string;
  name: string;
  city: string;
  flatCount: number;
  commonCharge: number;
  tzOffsetMinutes: number;
  deviceToken: string;
  adminEmails: string[];
  createdAt: string;
  updatedAt: string;
}

const now = () => new Date().toISOString();
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}`);
const stamp = <T extends object>(r: T): T & { createdAt: string; updatedAt: string } => ({ createdAt: now(), updatedAt: now(), ...r });

const db = {
  society: null as Society | null,
  seedParams: { blocks: ["A", "B", "C", "D"], perBlock: 10 },
  Flat: new Map<string, Row>(),
  Reading: new Map<string, Row>(),
  TankerDelivery: new Map<string, Row>(),
  SourceSupply: new Map<string, Row>(),
  Bill: new Map<string, Row>(),
  Alert: new Map<string, Row>(),
  Insight: new Map<string, Row>(),
};
type Table = Exclude<keyof typeof db, "society" | "seedParams">;

function reset(name = "Green Meadows CHS", city = "Pune", blocks = ["A", "B", "C", "D"], perBlock = 10, commonCharge = 150, save = true) {
  for (const t of ["Flat", "Reading", "TankerDelivery", "SourceSupply", "Bill", "Alert", "Insight"] as Table[]) db[t].clear();
  const seed = generateSeed({ societyId: DEMO_SOCIETY_ID, blocks, flatsPerBlock: perBlock });
  db.seedParams = { blocks, perBlock };
  const put = (t: Table, rows: object[]) => rows.forEach((r) => db[t].set((r as Row).id, stamp(r) as Row));
  put("Flat", seed.flats);
  put("Reading", seed.readings);
  put("TankerDelivery", seed.tankers);
  put("SourceSupply", seed.supplies);
  db.society = stamp({
    societyId: DEMO_SOCIETY_ID,
    name,
    city,
    flatCount: seed.flats.length,
    commonCharge,
    tzOffsetMinutes: TZ,
    deviceToken: "demo-device-token",
    adminEmails: [DEMO_EMAIL],
  });
  const leak = seed.flats.find((f) => f.id === seed.leakFlatId)!;
  if (save) persist();
  return { seeded: true, flats: seed.flats.length, readings: seed.readings.length, tankers: seed.tankers.length, leakFlat: flatLabel(leak) };
}

const STORAGE_KEY = "aqualedger-demo-v1";
const SAVED: Table[] = ["Flat", "TankerDelivery", "SourceSupply", "Bill", "Alert", "Insight"];

/** Save everything except seed readings (regenerated deterministically on load). */
function persist() {
  try {
    const state = {
      society: db.society,
      seedParams: db.seedParams,
      tables: Object.fromEntries(SAVED.map((t) => [t, [...db[t].values()]])),
      readings: [...db.Reading.values()].filter((r) => r.source !== "seed"),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // private mode / storage full: the demo still works, it just won't survive a reload
  }
}

function restore(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    const s: Society = state.society;
    // rebuild seed readings without saving, or the fresh state would overwrite what we're restoring
    reset(s.name, s.city, state.seedParams.blocks, state.seedParams.perBlock, s.commonCharge, false);
    db.society = s;
    for (const t of SAVED) {
      db[t].clear();
      for (const r of state.tables[t] ?? []) db[t].set(r.id, r);
    }
    for (const r of state.readings ?? []) db.Reading.set(r.id, r);
    return true;
  } catch {
    return false;
  }
}

function ensure() {
  if (!db.society && !restore()) reset();
  return db.society!;
}

const all = <T>(t: Table) => [...db[t].values()] as unknown as T[];
const societyData = (): SocietyData => ({
  societyId: DEMO_SOCIETY_ID,
  flats: all<FlatRec>("Flat"),
  readings: all<ReadingRec>("Reading"),
  tankers: all<TankerRec>("TankerDelivery"),
  supplies: all<SupplyRec>("SourceSupply"),
  alerts: all<AlertRec>("Alert"),
});

// ---------- Amplify-client-shaped API ----------
const ok = <T>(data: T, nextToken: string | null = null) => Promise.resolve({ data, errors: undefined, nextToken });
const fail = (message: string) => Promise.resolve({ data: null, errors: [{ message }], nextToken: null });
const pause = () => new Promise((r) => setTimeout(r, 150)); // feel like a network call
const copy = <T>(x: T): T => structuredClone(x);

interface ListOpts {
  sortDirection?: "ASC" | "DESC";
  limit?: number;
  nextToken?: string | null;
}
type KeyCond = Record<string, unknown>;

function matchCond(row: Row, cond: KeyCond) {
  return Object.entries(cond).every(([k, v]) => {
    if (v && typeof v === "object") {
      const c = v as Record<string, string>;
      if ("eq" in c) return row[k] === c.eq;
      if ("ge" in c) return row[k] >= c.ge;
      if ("gt" in c) return row[k] > c.gt;
      if ("le" in c) return row[k] <= c.le;
      if ("between" in c) return row[k] >= c.between[0] && row[k] <= c.between[1];
      return true;
    }
    return row[k] === v;
  });
}

function index(t: Table, sortKey?: string) {
  return async (cond: KeyCond, opts: ListOpts = {}) => {
    ensure();
    await pause();
    let rows = [...db[t].values()].filter((r) => matchCond(r, cond));
    if (sortKey) rows.sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])) * (opts.sortDirection === "DESC" ? -1 : 1));
    const start = Number(opts.nextToken ?? 0);
    const limit = opts.limit ?? 100;
    const page = rows.slice(start, start + limit);
    return ok(copy(page), start + limit < rows.length ? String(start + limit) : null);
  };
}

function crud(t: Table) {
  return {
    get: async ({ id }: { id: string }) => (ensure(), await pause(), ok(copy(db[t].get(id) ?? null))),
    create: async (input: Record<string, unknown>) => {
      ensure();
      await pause();
      if (input.societyId !== DEMO_SOCIETY_ID) return fail("Not Authorized to access create on this society");
      const row = stamp({ id: uid(), ...input }) as Row;
      db[t].set(row.id, row);
      persist();
      return ok(copy(row));
    },
    update: async (input: { id: string } & Record<string, unknown>) => {
      ensure();
      await pause();
      const cur = db[t].get(input.id);
      if (!cur) return fail("The conditional request failed");
      const row = { ...cur, ...input, updatedAt: now() } as Row;
      db[t].set(row.id, row);
      persist();
      return ok(copy(row));
    },
    delete: async ({ id }: { id: string }) => {
      ensure();
      await pause();
      const cur = db[t].get(id);
      db[t].delete(id);
      persist();
      return ok(copy(cur ?? null));
    },
  };
}

function runAnalysis(task: string, month?: string | null) {
  const society = ensure();
  const data = societyData();
  const at = new Date();
  const reportMonth = month || addMonths(localMonth(at, TZ), -1);
  const out: Record<string, unknown> = { societyId: DEMO_SOCIETY_ID, task };
  if (task === "leaks" || task === "all") {
    const { alerts, summary } = planLeakAlerts(data, at, TZ, uid);
    alerts.forEach((a) => db.Alert.set(a.id, stamp(a) as unknown as Row));
    out.leaks = summary;
  }
  if (task === "billing" || task === "all") {
    const existing = all<BillRec>("Bill").filter((b) => b.month === reportMonth);
    const { toWrite, summary } = planBilling(data, reportMonth, society.commonCharge, TZ, existing);
    toWrite.forEach((b) => db.Bill.set(b.id, stamp(b) as unknown as Row));
    out.billing = summary;
  }
  if (task === "insights" || task === "all") {
    const fresh = societyData();
    const dash = buildDashboard(fresh, at, TZ);
    const summaryText = ruleBasedSummary(dash, fresh.alerts.filter((a) => !a.resolved).map((a) => a.message));
    const id = `${DEMO_SOCIETY_ID}#${reportMonth}`;
    db.Insight.set(id, stamp({ id, societyId: DEMO_SOCIETY_ID, month: reportMonth, summaryText, forecast: dash.forecast, generatedBy: "rules" }) as Row);
    out.insights = { month: reportMonth, generatedBy: "rules", summaryText };
  }
  persist();
  return out;
}

const latestInsight = () => all<Row>("Insight").sort((a, b) => b.month.localeCompare(a.month))[0] ?? null;
const billsForFlat = (flatId: string) => all<BillRec>("Bill").filter((b) => b.flatId === flatId).sort((a, b) => b.month.localeCompare(a.month));

export const demoClient = {
  models: {
    Society: {
      get: async () => (await pause(), ok(copy(ensure()))),
      update: async (input: Partial<Society>) => {
        await pause();
        db.society = { ...ensure(), ...input, updatedAt: now() } as Society;
        persist();
        return ok(copy(db.society));
      },
    },
    Flat: { ...crud("Flat"), listFlatsBySociety: index("Flat") },
    Reading: { ...crud("Reading"), listReadingsBySociety: index("Reading", "timestamp") },
    TankerDelivery: { ...crud("TankerDelivery"), listTankersBySociety: index("TankerDelivery", "date") },
    SourceSupply: { ...crud("SourceSupply"), listSuppliesBySociety: index("SourceSupply", "date") },
    Bill: { ...crud("Bill"), listBillsBySociety: index("Bill", "month") },
    Alert: { ...crud("Alert"), listAlertsBySociety: index("Alert", "detectedAt") },
    Insight: { ...crud("Insight"), listInsightsBySociety: index("Insight", "month") },
  },
  queries: {
    getDashboard: async () => {
      const society = ensure();
      await pause();
      return ok({ society: { name: society.name, city: society.city }, dashboard: buildDashboard(societyData(), new Date(), TZ), insight: copy(latestInsight()) });
    },
    getFlatDetail: async ({ flatId }: { flatId: string }) => {
      ensure();
      await pause();
      const detail = buildFlatDetail(societyData(), flatId, new Date(), TZ);
      return detail ? ok({ ...detail, bills: billsForFlat(flatId) }) : fail("Flat not found");
    },
    askWaterData: async ({ question }: { question: string }) => {
      ensure();
      await pause();
      const data = societyData();
      const answer = ruleBasedAnswer(question, buildDashboard(data, new Date(), TZ), data.alerts.filter((a) => !a.resolved).map((a) => a.message));
      return ok({ answer, source: "rules" });
    },
    systemCheck: async () => {
      ensure();
      await pause();
      const flats = db.Flat.size;
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const recent = [...db.Reading.values()].filter((r) => r.timestamp >= weekAgo).length;
      return ok({
        checkedAt: now(),
        region: "offline demo",
        overall: "warn",
        checks: [
          { id: "database", name: "Database", status: "pass", detail: `${flats} flats; ${recent.toLocaleString("en-IN")} readings in the last 7 days (in this browser).` },
          { id: "schedule", name: "Nightly leak scan", status: "warn", detail: "Demo mode has no scheduler.", fix: "Use “Run analysis now” on the dashboard." },
          { id: "emails", name: "Alert emails", status: "warn", detail: "Demo mode doesn't send email." },
          { id: "meter", name: "Smart-meter endpoint", status: "pass", detail: "Simulated in the browser (Live meters page)." },
          { id: "ai-chat", name: "AI answers (chat)", status: "warn", detail: "Demo mode uses the free rule-based answers." },
          { id: "ai-insights", name: "AI monthly summaries", status: "warn", detail: "Demo mode uses the free rule-based summaries." },
        ],
      });
    },
    myResidentPortal: async () => {
      const society = ensure();
      await pause();
      const flat = all<FlatRec>("Flat").find((f) => flatLabel(f) === DEMO_RESIDENT_FLAT) ?? all<FlatRec>("Flat")[0];
      const detail = buildFlatDetail(societyData(), flat.id, new Date(), TZ)!;
      return ok({
        email: "resident@demo.aqualedger",
        society: { name: society.name, city: society.city },
        ...detail,
        flat: { label: detail.flat.label, block: flat.block, number: flat.number },
        bills: billsForFlat(flat.id).filter((b) => b.status !== "draft"),
      });
    },
  },
  mutations: {
    setupSociety: async (a: { name: string; city?: string; blocks: string[]; flatsPerBlock: number; commonCharge?: number }) => {
      await pause();
      const blocks = a.blocks.map((b) => b.trim().toUpperCase()).filter(Boolean);
      return ok({ societyId: DEMO_SOCIETY_ID, ...reset(a.name, a.city ?? "", blocks, a.flatsPerBlock, a.commonCharge ?? 150) });
    },
    seedDemoData: async () => {
      const s = ensure();
      await pause();
      return ok(reset(s.name, s.city, undefined, undefined, s.commonCharge));
    },
    inviteResident: async ({ flatId, email }: { flatId: string; email: string }) => {
      ensure();
      await pause();
      const flat = db.Flat.get(flatId);
      if (!flat) return fail("Flat not found in this society");
      flat.residentEmail = email.trim().toLowerCase();
      persist();
      return ok({ ok: true, invited: true, email: flat.residentEmail, flat: `${flat.block}-${flat.number}` });
    },
    inviteAdmin: async ({ email }: { email: string }) => {
      const s = ensure();
      await pause();
      const e = email.trim().toLowerCase();
      s.adminEmails = [...new Set([...s.adminEmails, e])];
      persist();
      return ok({ ok: true, invited: true, email: e, adminEmails: [...s.adminEmails] });
    },
    importReadingsCsv: async ({ csv }: { csv: string }) => {
      ensure();
      await pause();
      const { rows, errors } = parseReadingsCsv(csv, all<FlatRec>("Flat"), TZ);
      rows.forEach((r) => {
        const row = stamp({ id: uid(), societyId: DEMO_SOCIETY_ID, source: "csv", ...r }) as Row;
        db.Reading.set(row.id, row);
      });
      persist();
      return ok({ imported: rows.length, errors: errors.slice(0, 25), errorCount: errors.length });
    },
    runAnalysis: async ({ task, month }: { task: string; month?: string | null }) => {
      await pause();
      return ok(runAnalysis(task, month));
    },
  },
};

/** Same contract as the meter-ingest Lambda: store the reading, raise a live alert on abnormal flow. */
export async function demoIngest(body: { societyId: string; flat: string; litres: number; periodMinutes?: number }, token: string) {
  const society = ensure();
  await pause();
  if (token !== society.deviceToken) return { status: 401, body: { error: "Bad device token" } };
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const flat = all<FlatRec>("Flat").find((f) => norm(flatLabel(f)) === norm(body.flat));
  if (!flat) return { status: 404, body: { error: `Unknown flat ${body.flat}` } };
  const periodMinutes = body.periodMinutes ?? 1;
  const reading = stamp({ id: uid(), societyId: DEMO_SOCIETY_ID, flatId: flat.id, timestamp: now(), periodMinutes, litres: body.litres, source: "iot" }) as Row;
  db.Reading.set(reading.id, reading);
  persist();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const history = all<ReadingRec>("Reading").filter((r) => r.flatId === flat.id && r.source !== "iot" && r.timestamp >= weekAgo);
  const baseline = history.reduce((a, r) => a + r.litres, 0) / (7 * 1440);
  const spike = detectLiveSpike(body.litres, periodMinutes, baseline);
  if (!spike) return { status: 200, body: { ok: true, alert: null } };
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  if (all<AlertRec>("Alert").some((a) => a.flatId === flat.id && a.type === "live_spike" && !a.resolved && a.detectedAt >= since)) {
    return { status: 200, body: { ok: true, alert: "already-open" } };
  }
  const message = `${flatLabel(flat)} is drawing ${spike.rate} L/min right now, ${spike.ratio}x its normal rate. Possible burst pipe or open tap.`;
  const alert = stamp({ id: uid(), societyId: DEMO_SOCIETY_ID, flatId: flat.id, flatLabel: flatLabel(flat), type: "live_spike", severity: spike.severity, message, detectedAt: now(), resolved: false }) as Row;
  db.Alert.set(alert.id, alert);
  persist();
  return { status: 200, body: { ok: true, alert: message } };
}
