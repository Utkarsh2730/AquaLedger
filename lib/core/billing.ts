import { round } from "./aggregate";
import type { BillRec, FlatRec } from "./types";
import { flatLabel } from "./types";

export interface BillingInput {
  societyId: string;
  month: string;
  flats: FlatRec[];
  /** flatId -> metered litres for the month */
  usage: Map<string, number>;
  /** everything the society paid for water this month (tankers + municipal + borewell power) */
  totalWaterCost: number;
  /** fixed per-flat common-area charge (gardens, lobby, pool...) */
  commonCharge: number;
}

/**
 * Usage-based billing: split the month's total water cost by each flat's share of metered
 * litres, then add the fixed common-area charge. Bill ids are deterministic so re-running a
 * month overwrites drafts instead of duplicating them.
 */
export function computeBills(input: BillingInput): BillRec[] {
  const total = input.flats.reduce((a, f) => a + (input.usage.get(f.id) ?? 0), 0);
  return input.flats.map((f) => {
    const litres = input.usage.get(f.id) ?? 0;
    const share = total > 0 ? litres / total : 1 / input.flats.length;
    const usageCharge = round(input.totalWaterCost * share, 2);
    return {
      id: `${input.month}#${f.id}`,
      societyId: input.societyId,
      flatId: f.id,
      flatLabel: flatLabel(f),
      month: input.month,
      litres: round(litres),
      sharePct: round(share * 100, 3),
      usageCharge,
      commonCharge: input.commonCharge,
      amount: round(usageCharge + input.commonCharge, 2),
      totalWaterCost: round(input.totalWaterCost, 2),
      status: "draft",
    };
  });
}

/** What each flat would have paid under the old "split equally" rule, for the pitch. */
export function equalSplit(totalWaterCost: number, flatCount: number, commonCharge: number) {
  return round(totalWaterCost / Math.max(flatCount, 1) + commonCharge, 2);
}
