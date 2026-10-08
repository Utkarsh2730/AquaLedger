import { mean, round } from "./aggregate";
import { addMonths } from "./time";

/**
 * Seasonal demand factors (index 1-12). Indian summers (March-May) drive demand and tanker
 * prices up; the monsoon months bring it down. Factors average to ~1.0 over the year.
 */
export const SEASONAL_FACTOR: Record<number, number> = {
  1: 0.95, 2: 1.0, 3: 1.12, 4: 1.25, 5: 1.3, 6: 1.1, 7: 0.88, 8: 0.85, 9: 0.88, 10: 0.92, 11: 0.92, 12: 0.93,
};

/** Borewell yield drops as the water table falls in summer. */
export const BOREWELL_FACTOR: Record<number, number> = {
  1: 0.95, 2: 0.9, 3: 0.75, 4: 0.6, 5: 0.5, 6: 0.65, 7: 1.0, 8: 1.1, 9: 1.1, 10: 1.05, 11: 1.0, 12: 1.0,
};

const monthNum = (month: string) => Number(month.slice(5, 7));

export interface ForecastInput {
  /** month (YYYY-MM) -> litres consumed, complete months only */
  consumption: Map<string, number>;
  /** month -> municipal litres supplied */
  municipal: Map<string, number>;
  /** month -> borewell litres supplied */
  borewell: Map<string, number>;
  /** month -> tanker litres / cost, used for the average tanker size and price */
  tankerLitres: Map<string, number>;
  tankerCost: Map<string, number>;
  tankerCount: Map<string, number>;
  /** the month being forecast (YYYY-MM) */
  targetMonth: string;
  defaultTankerLitres?: number;
  defaultTankerCost?: number;
}

export interface Forecast {
  month: string;
  demandLitres: number;
  municipalLitres: number;
  borewellLitres: number;
  shortfallLitres: number;
  tankers: number;
  tankerLitres: number;
  tankerUnitCost: number;
  tankerCost: number;
  seasonalFactor: number;
  basisMonths: string[];
}

/**
 * Next month's demand = 3-month moving average of de-seasonalised consumption x the target
 * month's seasonal factor. Tankers fill whatever municipal + borewell supply can't cover.
 */
export function forecastMonth(input: ForecastInput): Forecast {
  const basis = [1, 2, 3].map((i) => addMonths(input.targetMonth, -i)).filter((m) => input.consumption.has(m));
  const deseasonalised = basis.map((m) => (input.consumption.get(m) ?? 0) / SEASONAL_FACTOR[monthNum(m)]);
  const factor = SEASONAL_FACTOR[monthNum(input.targetMonth)];
  const demand = mean(deseasonalised) * factor;

  const municipal = mean(basis.map((m) => input.municipal.get(m) ?? 0));
  const borewellBase = mean(basis.map((m) => (input.borewell.get(m) ?? 0) / BOREWELL_FACTOR[monthNum(m)]));
  const borewell = borewellBase * BOREWELL_FACTOR[monthNum(input.targetMonth)];

  const tl = sumOver(input.tankerLitres, basis);
  const tc = sumOver(input.tankerCost, basis);
  const tn = sumOver(input.tankerCount, basis);
  const unitLitres = tn > 0 ? tl / tn : input.defaultTankerLitres ?? 10_000;
  const unitCost = tn > 0 ? tc / tn : input.defaultTankerCost ?? 1_800;
  // Summer tankers cost more; scale the price with the same seasonal pressure.
  const basisFactor = basis.length ? mean(basis.map((m) => SEASONAL_FACTOR[monthNum(m)])) : 1;
  const priceAdj = factor / basisFactor;

  const shortfall = Math.max(0, demand - municipal - borewell);
  const tankers = Math.ceil(shortfall / unitLitres);
  return {
    month: input.targetMonth,
    demandLitres: round(demand),
    municipalLitres: round(municipal),
    borewellLitres: round(borewell),
    shortfallLitres: round(shortfall),
    tankers,
    tankerLitres: round(unitLitres),
    tankerUnitCost: round(unitCost * priceAdj),
    tankerCost: round(tankers * unitCost * priceAdj),
    seasonalFactor: factor,
    basisMonths: basis,
  };
}

function sumOver(m: Map<string, number>, keys: string[]) {
  return keys.reduce((a, k) => a + (m.get(k) ?? 0), 0);
}
