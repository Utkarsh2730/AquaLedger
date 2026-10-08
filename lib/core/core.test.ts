import { describe, expect, it } from "vitest";
import { generateSeed } from "./seed";
import { detectLeaks, detectLiveSpike, detectNightFlow, detectSpikes, pickTargetDay } from "./leak";
import { computeBills, equalSplit } from "./billing";
import { forecastMonth } from "./forecast";
import { buildDashboard, buildFlatDetail } from "./summary";
import { parseReadingsCsv } from "./csv";
import { ruleBasedAnswer, ruleBasedSummary } from "./insights";
import { localDay, localHour, localToUtcIso } from "./time";

const now = new Date("2026-10-08T06:00:00Z");
const seed = generateSeed({ societyId: "soc-1", now });
const data = { societyId: "soc-1", ...seed, alerts: [] };

describe("time helpers", () => {
  it("round-trips local IST day and hour", () => {
    const iso = localToUtcIso("2026-10-07", 2);
    expect(iso).toBe("2026-10-06T20:30:00.000Z");
    expect(localDay(iso)).toBe("2026-10-07");
    expect(localHour(iso)).toBe(2);
  });
});

describe("seed data", () => {
  it("creates 40 flats with ~6 months of readings and supplies", () => {
    expect(seed.flats).toHaveLength(40);
    const days = new Set(seed.readings.map((r) => localDay(r.timestamp)));
    expect(days.size).toBe(183);
    expect(seed.readings.length).toBe(40 * (176 + 7 * 24));
    expect(seed.tankers.length).toBeGreaterThan(20);
    expect(new Set(seed.supplies.map((s) => s.type))).toEqual(new Set(["municipal", "borewell"]));
  });

  it("is deterministic", () => {
    const again = generateSeed({ societyId: "soc-1", now });
    expect(again.readings.slice(0, 50)).toEqual(seed.readings.slice(0, 50));
  });
});

describe("leak detection", () => {
  it("flags only the planted leak flat, by both rules", () => {
    const findings = detectLeaks(seed.flats, seed.readings, { now });
    const flagged = new Set(findings.map((f) => f.flatId));
    expect(flagged).toEqual(new Set([seed.leakFlatId]));
    expect(findings.map((f) => f.type).sort()).toEqual(["night_flow", "spike"]);
  });

  it("night-flow rule needs 3+ nights", () => {
    const flat = seed.flats[0];
    const mk = (day: string, hour: number, litres: number) => ({
      id: `${day}-${hour}`, societyId: "s", flatId: flat.id, timestamp: localToUtcIso(day, hour), periodMinutes: 60, litres, source: "seed" as const,
    });
    const two = ["2026-10-06", "2026-10-07"].flatMap((d) => [mk(d, 2, 10), mk(d, 3, 11)]);
    expect(detectNightFlow([flat], two, { now })).toHaveLength(0);
    const three = ["2026-10-05", "2026-10-06", "2026-10-07"].flatMap((d) => [mk(d, 2, 10), mk(d, 3, 11)]);
    expect(detectNightFlow([flat], three, { now })).toHaveLength(1);
  });

  it("a leak that has run for days stays far above its own baseline", () => {
    const spike = detectSpikes(seed.flats, seed.readings, { now })[0];
    expect(spike.flatLabel).toBe("B-202");
    expect(Number(spike.evidence.z)).toBeGreaterThan(6); // was ~2.5 when leak days polluted the baseline
    // with no gap (the old behaviour) the same leak barely clears the threshold
    const old = detectSpikes(seed.flats, seed.readings, { now, baselineGapDays: 0 })[0];
    expect(Number(old.evidence.z)).toBeLessThan(Number(spike.evidence.z));
  });

  it("spike rule ignores normal days", () => {
    const quiet = seed.readings.filter((r) => r.flatId !== seed.leakFlatId);
    expect(detectSpikes(seed.flats, quiet, { now })).toHaveLength(0);
  });

  it("still finds the planted leak when the demo data is days old", () => {
    const later = new Date(now.getTime() + 4 * 86_400_000);
    // naive "yesterday" has no data any more, so the spike rule goes blind
    expect(detectLeaks(seed.flats, seed.readings, { now: later }).map((f) => f.type)).toEqual(["night_flow"]);
    const targetDay = pickTargetDay(seed.readings, later);
    expect(targetDay).toBe("2026-10-07");
    expect(new Set(detectLeaks(seed.flats, seed.readings, { now: later, targetDay }).map((f) => f.type))).toEqual(new Set(["spike", "night_flow"]));
    // live meter ticks today don't move the target day
    const tick = { ...seed.readings[0], id: "t", timestamp: later.toISOString(), source: "iot" as const };
    expect(pickTargetDay([...seed.readings, tick], later)).toBe("2026-10-07");
    // fresh data: plain yesterday
    expect(pickTargetDay(seed.readings, now)).toBe("2026-10-07");
  });

  it("live spike fires for an open tap but not a normal tick", () => {
    expect(detectLiveSpike(12, 1, 0.35)).not.toBeNull();
    expect(detectLiveSpike(0.5, 1, 0.35)).toBeNull();
  });
});

describe("billing", () => {
  it("splits cost by metered share and adds the common charge", () => {
    const flats = seed.flats.slice(0, 2);
    const bills = computeBills({
      societyId: "s", month: "2026-09", flats, totalWaterCost: 1000, commonCharge: 150,
      usage: new Map([[flats[0].id, 3000], [flats[1].id, 1000]]),
    });
    expect(bills.map((b) => b.usageCharge)).toEqual([750, 250]);
    expect(bills.map((b) => b.amount)).toEqual([900, 400]);
    expect(bills[0].id).toBe(`2026-09#${flats[0].id}`);
    expect(equalSplit(1000, 2, 150)).toBe(650);
  });
});

describe("forecast", () => {
  it("raises demand and tanker count heading into summer", () => {
    const consumption = new Map([["2026-01", 500_000], ["2026-02", 520_000], ["2026-03", 580_000]]);
    const flat = (v: number) => new Map([...consumption.keys()].map((m) => [m, v]));
    const f = forecastMonth({
      targetMonth: "2026-04", consumption,
      municipal: flat(200_000), borewell: flat(150_000),
      tankerLitres: flat(150_000), tankerCost: flat(25_500), tankerCount: flat(15),
    });
    expect(f.basisMonths).toEqual(["2026-03", "2026-02", "2026-01"]);
    expect(f.demandLitres).toBeGreaterThan(580_000);
    expect(f.borewellLitres).toBeLessThan(150_000);
    expect(f.tankers).toBeGreaterThan(15);
  });
});

describe("dashboard + insights", () => {
  const dash = buildDashboard(data, now);
  it("aggregates KPIs, sources and top flats", () => {
    expect(dash.currentMonth).toBe("2026-10");
    expect(dash.monthly.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(dash.topFlats).toHaveLength(10);
    const tanker = dash.costPerKlBySource.find((s) => s.source === "Tanker")!;
    const muni = dash.costPerKlBySource.find((s) => s.source === "Municipal")!;
    expect(tanker.costPerKl).toBeGreaterThan(muni.costPerKl);
    expect(dash.forecast?.month).toBe("2026-11");
    // summer (May) costs more than monsoon (Aug)
    const may = dash.monthly.find((m) => m.month === "2026-05")!;
    const aug = dash.monthly.find((m) => m.month === "2026-08")!;
    expect(may.tankerCost).toBeGreaterThan(aug.tankerCost);
  });

  it("forecasts from complete months only and never charts today's partial day", () => {
    // `now` is Oct 8th: October has only 7 complete days and must not drag the forecast down
    expect(dash.forecast!.basisMonths).toEqual(["2026-09", "2026-08", "2026-07"]);
    const sep = dash.monthly.find((m) => m.month === "2026-09")!.consumedLitres;
    expect(dash.forecast!.demandLitres).toBeGreaterThan(sep * 0.95); // Nov is ~Sept-level demand, not a third of it
    expect(dash.dailyTrend.at(-1)!.day).toBe("2026-10-07");
    expect(Math.min(...dash.dailyTrend.slice(-30).map((d) => d.litres))).toBeGreaterThan(5_000);
    // average over the 7 complete October days, not divided by 8
    const oct = dash.dailyTrend.filter((d) => d.day.startsWith("2026-10"));
    expect(oct).toHaveLength(7);
    const expected = oct.reduce((a, d) => a + d.litres, 0) / 40 / 7;
    expect(dash.kpis.avgLitresPerFlatPerDay).toBeCloseTo(expected, -1);
  });

  it("builds a flat drill-down", () => {
    const d = buildFlatDetail(data, seed.leakFlatId, now)!;
    expect(d.flat.label).toBe("B-202");
    expect(d.daily.at(-2)!.litres).toBeGreaterThan(d.daily.at(-2)!.buildingAvg);
  });

  it("writes rule-based summaries and answers", () => {
    expect(ruleBasedSummary(dash)).toMatch(/Sept? 2026/);
    expect(ruleBasedAnswer("Why did our bill go up this month?", dash)).toMatch(/Total water cost went from/);
    expect(ruleBasedAnswer("how many tankers next month?", dash)).toMatch(/tankers/);
  });
});

describe("csv import", () => {
  it("parses daily and hourly rows and reports bad lines", () => {
    const csv = "flat,date,hour,litres\nB-202,2026-10-01,,450\nb202,2026-10-01,3,12.5\nZ-999,2026-10-01,,1\nA-101,2026/10/01,,3";
    const { rows, errors } = parseReadingsCsv(csv, seed.flats);
    expect(rows).toHaveLength(2);
    expect(rows[0].periodMinutes).toBe(1440);
    expect(rows[1].periodMinutes).toBe(60);
    expect(errors).toHaveLength(2);
  });
});

import { formatAccessCode, generateAccessCode, hashAccessCode, isWellFormedAccessCode, normalizeAccessCode, residentLink } from "./access";

describe("resident access codes", () => {
  it("generates readable, well-formed, unique codes", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateAccessCode()));
    expect(codes.size).toBe(500);
    for (const c of codes) {
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(isWellFormedAccessCode(c)).toBe(true);
    }
  });

  it("forgives spacing, case and look-alike characters", async () => {
    expect(normalizeAccessCode(" k7m2 qx9p-4hdr ")).toBe("K7M2QX9P4HDR");
    expect(normalizeAccessCode("O0Il")).toBe("0011");
    expect(formatAccessCode("k7m2qx9p4hdr")).toBe("K7M2-QX9P-4HDR");
    expect(await hashAccessCode("k7m2 qx9p 4hdr")).toBe(await hashAccessCode("K7M2-QX9P-4HDR"));
    expect(await hashAccessCode("K7M2-QX9P-4HDR")).not.toBe(await hashAccessCode("K7M2-QX9P-4HDS"));
    expect(isWellFormedAccessCode("K7M2-QX9P")).toBe(false);
  });

  it("builds the share link", () => {
    expect(residentLink("https://app.example/", "k7m2qx9p4hdr")).toBe("https://app.example/resident/?code=K7M2-QX9P-4HDR");
  });
});

import { accessEmail, normalizePhone, parseEmailList, parsePhoneList, parseResidentContacts, whatsappLink, whatsappTemplateMessage, whatsappText } from "./residents";

describe("resident contact import", () => {
  const flats = [
    { id: "f1", block: "A", number: "101" },
    { id: "f2", block: "A", number: "102" },
    { id: "f3", block: "B", number: "202" },
  ];

  it("reads the usual register shapes", () => {
    const csv = [
      "Flat,Name,Email,Mobile",
      "A-101, Rahul Sharma, Rahul@Example.com, 98765 43210",
      "a 101,Priya,priya@example.com,+91-91234-56789",
      "A,102,owner@example.com; tenant@example.com",
      '"B/202","b202@example.com rent@example.com"',
      "B-202,,,09811122233 / 9822233344",
      "C-901,ghost@example.com",
      "A-102,not-an-email@,12345678",
      "A-101,rahul@example.com,9876543210",
      "",
    ].join("\n");
    const r = parseResidentContacts(csv, flats);
    expect(r.byFlat.get("f1")).toEqual({ emails: ["rahul@example.com", "priya@example.com"], phones: ["+919876543210", "+919123456789"] });
    expect(r.byFlat.get("f2")).toEqual({ emails: ["owner@example.com", "tenant@example.com"], phones: [] });
    expect(r.byFlat.get("f3")).toEqual({ emails: ["b202@example.com", "rent@example.com"], phones: ["+919811122233", "+919822233344"] });
    expect(r.unknownFlats).toEqual(["C-901"]);
    expect(r.badEmails).toEqual(["not-an-email@"]);
    expect(r.badPhones).toEqual(["12345678"]);
  });

  it("takes mobile-only rows", () => {
    const r = parseResidentContacts("A-102\t98765 43210", flats);
    expect(r.byFlat.get("f2")).toEqual({ emails: [], phones: ["+919876543210"] });
  });

  it("caps contacts per flat", () => {
    const csv = Array.from({ length: 9 }, (_, i) => `A-101,r${i}@example.com`).join("\n");
    const r = parseResidentContacts(csv, flats);
    expect(r.byFlat.get("f1")!.emails).toHaveLength(6);
    expect(r.truncated).toEqual(["A-101"]);
  });

  it("normalizes mobile numbers", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("098765-43210")).toBe("+919876543210");
    expect(normalizePhone("919876543210")).toBe("+919876543210");
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
    expect(normalizePhone("0044 7700 900123")).toBe("+447700900123");
    expect(normalizePhone("1234567890")).toBeNull(); // Indian mobiles start with 6-9
    expect(normalizePhone("101")).toBeNull();
    expect(parsePhoneList("98765 43210, 9876543210 / 12")).toEqual({ phones: ["+919876543210"], bad: ["12"] });
  });

  it("parses a typed email list", () => {
    expect(parseEmailList("A@x.com, b@y.in  a@x.com; nope")).toEqual({ emails: ["a@x.com", "b@y.in"], bad: ["nope"] });
  });

  it("writes an email with the flat and code, and escapes the society name", () => {
    const m = accessEmail({ societyName: "Green <Meadows>", flat: "A-101", code: "k7m2qx9p4hdr", link: "https://x.app/resident/?code=K7M2-QX9P-4HDR", portalUrl: "https://x.app/resident/" });
    expect(m.subject).toContain("A-101");
    expect(m.text).toContain("K7M2-QX9P-4HDR");
    expect(m.html).toContain("Green &lt;Meadows&gt;");
    expect(m.html).not.toContain("<Meadows>");
  });

  it("builds WhatsApp messages", () => {
    const text = whatsappText({ societyName: "Green Meadows", flat: "A-101", code: "k7m2qx9p4hdr", link: "https://x.app/resident/?code=K7M2-QX9P-4HDR" });
    expect(text).toContain("Access code: K7M2-QX9P-4HDR");
    expect(whatsappLink("+919876543210", "hi there")).toBe("https://wa.me/919876543210?text=hi%20there");
    const msg = whatsappTemplateMessage({ to: "+919876543210", societyName: "Green Meadows", flat: "A-101", code: "k7m2qx9p4hdr", link: "https://x" });
    expect(msg.template.name).toBe("aqualedger_login");
    expect(msg.template.components[0].parameters.map((p) => p.text)).toEqual(["Green Meadows", "A-101", "K7M2-QX9P-4HDR", "https://x"]);
  });
});

import { readFileSync } from "node:fs";
import { missingBackendFeatures, REQUIRED_BACKEND } from "./backendCheck";
import introspectionBeforeBulk from "./fixtures/introspection-before-bulk.json";
import introspectionCurrent from "./fixtures/introspection-current.json";

describe("backend version check", () => {
  it("lists exactly the custom operations defined in the schema", () => {
    const schema = readFileSync(new URL("../../amplify/data/resource.ts", import.meta.url), "utf8");
    const ops = [...schema.matchAll(/\n {4}(\w+): a\s*\n\s*\.(query|mutation)\(\)/g)].map(([, name, kind]) => `${kind}:${name}`).sort();
    const required = [...Object.keys(REQUIRED_BACKEND.queries).map((q) => `query:${q}`), ...Object.keys(REQUIRED_BACKEND.mutations).map((m) => `mutation:${m}`)].sort();
    expect(required).toEqual(ops);
  });

  it("accepts a backend deployed from this code (from a CDK synth of amplify/)", () => {
    expect(missingBackendFeatures(introspectionCurrent)).toEqual([]);
  });

  it("spots a backend deployed before the latest change", () => {
    expect(missingBackendFeatures(introspectionBeforeBulk)).toEqual(["sendResidentAccess (includeUncontacted, returnCodes)"]);
  });

  it("spots a much older backend, and can't tell without introspection", () => {
    const old = structuredClone(introspectionBeforeBulk) as any;
    delete old.mutations.sendResidentAccess;
    delete old.queries.residentPortal;
    delete old.models.Flat.fields.residentPhones;
    expect(missingBackendFeatures(old)).toEqual(["residentPortal", "sendResidentAccess", "Flat.residentPhones"]);
    expect(missingBackendFeatures(undefined)).toBeNull();
    expect(missingBackendFeatures({} as any)).toBeNull();
  });
});
