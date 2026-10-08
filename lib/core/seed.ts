import { addDays, localDay, localToUtcIso, DEFAULT_TZ_OFFSET_MIN } from "./time";
import { SEASONAL_FACTOR, BOREWELL_FACTOR } from "./forecast";
import type { FlatRec, ReadingRec, SupplyRec, TankerRec } from "./types";

/** Small deterministic PRNG so the demo data is identical on every reset. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Share of a day's water used in each local hour (sums to 1). Morning and evening peaks. */
export const HOURLY_PROFILE = (() => {
  const w = [0.4, 0.3, 0.2, 0.2, 0.3, 1.5, 6, 9, 9, 6.5, 4.5, 3.5, 3.5, 3, 2.5, 2.5, 3, 4, 6, 7.5, 7, 5, 3, 1.2];
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
})();

export interface SeedOptions {
  societyId: string;
  blocks?: string[];
  flatsPerBlock?: number;
  /** daily history length */
  days?: number;
  /** the last N days are stored as hourly readings (needed for 2-4 a.m. night-flow detection) */
  hourlyDays?: number;
  now?: Date;
  /** flat label that gets the planted leak, e.g. "B-204" */
  leakFlat?: string;
  leakDays?: number;
  leakLitresPerHour?: number;
  tzOffsetMin?: number;
  idPrefix?: string;
}

export interface SeedResult {
  flats: FlatRec[];
  readings: ReadingRec[];
  supplies: SupplyRec[];
  tankers: TankerRec[];
  leakFlatId: string;
}

/** Flats are numbered floor + unit (101, 102, 201, ...). Ids are deterministic per society. */
export function generateFlats(societyId: string, blocks: string[], perBlock: number, idPrefix = societyId.slice(0, 8), rand = mulberry32(42)): FlatRec[] {
  const flats: FlatRec[] = [];
  for (const b of blocks) {
    for (let i = 0; i < perBlock; i++) {
      const floor = Math.floor(i / 2) + 1;
      const number = `${floor}0${(i % 2) + 1}`;
      flats.push({ id: `${idPrefix}-flat-${b}${number}`, societyId, block: b, number, occupants: 1 + Math.floor(rand() * 5) });
    }
  }
  return flats;
}

const VENDORS = ["Sai Ganesh Water Supply", "Shree Balaji Tankers", "Aqua Fresh Movers"];

export function generateSeed(opts: SeedOptions): SeedResult {
  const tz = opts.tzOffsetMin ?? DEFAULT_TZ_OFFSET_MIN;
  const rand = mulberry32(42);
  const blocks = opts.blocks ?? ["A", "B", "C", "D"];
  const perBlock = opts.flatsPerBlock ?? 10;
  const days = opts.days ?? 183;
  const hourlyDays = opts.hourlyDays ?? 7;
  const leakDays = opts.leakDays ?? 5;
  const leakLph = opts.leakLitresPerHour ?? 20;
  const pre = opts.idPrefix ?? opts.societyId.slice(0, 8);
  const today = localDay(opts.now ?? new Date(), tz);
  const lastDay = addDays(today, -1);
  const firstDay = addDays(lastDay, -(days - 1));
  const hourlyFrom = addDays(lastDay, -(hourlyDays - 1));
  const leakFrom = addDays(lastDay, -(leakDays - 1));

  const flats = generateFlats(opts.societyId, blocks, perBlock, pre, rand);
  const leakLabel = opts.leakFlat ?? "B-202";
  const leakFlat = flats.find((f) => `${f.block}-${f.number}` === leakLabel) ?? flats[0];
  // one heavy user (garden hose, big family) so "top flats" and fair billing have a story
  const heavyFlat = flats[flats.length - 3];

  const readings: ReadingRec[] = [];
  const consumptionByMonth = new Map<string, number>();
  for (const f of flats) {
    const perPerson = 105 + rand() * 45; // litres per person per day
    const base = (f.occupants ?? 3) * perPerson * (f === heavyFlat ? 1.9 : 1);
    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
      const month = Number(day.slice(5, 7));
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
      const weekend = dow === 0 || dow === 6 ? 1.1 : 1;
      const noise = 0.9 + rand() * 0.2;
      const dayLitres = base * SEASONAL_FACTOR[month] * weekend * noise;
      const leaking = f === leakFlat && day >= leakFrom;
      const monthKey = day.slice(0, 7);

      if (day < hourlyFrom) {
        const litres = Math.round(dayLitres + (leaking ? leakLph * 24 : 0));
        consumptionByMonth.set(monthKey, (consumptionByMonth.get(monthKey) ?? 0) + litres);
        readings.push({ id: `${f.id}-${day}`, societyId: opts.societyId, flatId: f.id, timestamp: localToUtcIso(day, 0, tz), periodMinutes: 1440, litres, source: "seed" });
      } else {
        for (let h = 0; h < 24; h++) {
          const hourNoise = 0.8 + rand() * 0.4;
          // normal households show ~0-2 L/h at night (an occasional flush), never a steady flow
          let litres = dayLitres * HOURLY_PROFILE[h] * hourNoise;
          if (h >= 1 && h <= 4 && rand() < 0.6) litres = 0;
          if (leaking) litres += leakLph * (0.95 + rand() * 0.1);
          litres = Math.round(litres * 10) / 10;
          consumptionByMonth.set(monthKey, (consumptionByMonth.get(monthKey) ?? 0) + litres);
          readings.push({ id: `${f.id}-${day}-${String(h).padStart(2, "0")}`, societyId: opts.societyId, flatId: f.id, timestamp: localToUtcIso(day, h, tz), periodMinutes: 60, litres, source: "seed" });
        }
      }
    }
  }

  // Supplies: municipal is rationed and flat; borewell sags in summer; tankers cover the gap.
  const supplies: SupplyRec[] = [];
  const tankers: TankerRec[] = [];
  for (const [month, used] of [...consumptionByMonth].sort()) {
    const m = Number(month.slice(5, 7));
    const monthStart = month === firstDay.slice(0, 7) ? firstDay : `${month}-01`;
    const monthDays = [...Array(31).keys()].map((i) => addDays(monthStart, i)).filter((d) => d.startsWith(month) && d <= lastDay);
    const fraction = monthDays.length / 30;
    const municipal = Math.round(used * 0.42 * (0.95 + rand() * 0.1));
    const borewell = Math.round(Math.min(used * 0.33 * BOREWELL_FACTOR[m], used - municipal) * (0.95 + rand() * 0.1));
    supplies.push({ id: `${pre}-mun-${month}`, societyId: opts.societyId, type: "municipal", litres: municipal, cost: Math.round(municipal * 0.022), date: monthDays[monthDays.length - 1] });
    supplies.push({ id: `${pre}-bore-${month}`, societyId: opts.societyId, type: "borewell", litres: borewell, cost: Math.round(borewell * 0.009), date: monthDays[monthDays.length - 1] });
    const gap = Math.max(0, used - municipal - borewell);
    const count = Math.max(fraction > 0.2 ? 1 : 0, Math.round(gap / 10_000));
    const price = Math.round((1300 + 900 * (SEASONAL_FACTOR[m] - 0.85) / 0.45) / 50) * 50; // ~1300 monsoon .. ~2200 May
    for (let i = 0; i < count; i++) {
      const date = monthDays[Math.floor((i / Math.max(count, 1)) * monthDays.length)];
      tankers.push({ id: `${pre}-tk-${month}-${i}`, societyId: opts.societyId, vendor: VENDORS[i % VENDORS.length], litres: 10_000, cost: price + (rand() < 0.3 ? 100 : 0), date });
    }
  }

  return { flats, readings, supplies, tankers, leakFlatId: leakFlat.id };
}
