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
