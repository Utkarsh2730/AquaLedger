// Plain data shapes shared by the Lambdas, the seed generator and the UI.
// They mirror the Amplify models in amplify/data/resource.ts.

export type ReadingSource = "manual" | "csv" | "iot" | "seed";
export type SupplyType = "municipal" | "borewell";
export type AlertType = "spike" | "night_flow" | "live_spike";
export type Severity = "low" | "medium" | "high";

export interface FlatRec {
  id: string;
  societyId: string;
  block: string;
  number: string;
  occupants?: number | null;
  accessCodeHash?: string | null;
  accessIssuedAt?: string | null;
}

export interface ReadingRec {
  id: string;
  societyId: string;
  flatId: string;
  /** ISO-8601 UTC start of the metered interval */
  timestamp: string;
  /** Length of the metered interval: 1440 = daily total, 60 = hourly, 1 = live meter tick */
  periodMinutes: number;
  litres: number;
  source: ReadingSource;
}

export interface TankerRec {
  id: string;
  societyId: string;
  vendor: string;
  litres: number;
  cost: number;
  /** YYYY-MM-DD */
  date: string;
}

export interface SupplyRec {
  id: string;
  societyId: string;
  type: SupplyType;
  litres: number;
  cost: number;
  date: string;
}

export interface BillRec {
  id: string;
  societyId: string;
  flatId: string;
  flatLabel: string;
  month: string;
  litres: number;
  sharePct: number;
  usageCharge: number;
  commonCharge: number;
  amount: number;
  totalWaterCost: number;
  status: "draft" | "issued" | "paid";
}

export interface AlertRec {
  id: string;
  societyId: string;
  flatId: string;
  flatLabel: string;
  type: AlertType;
  severity: Severity;
  message: string;
  detectedAt: string;
  resolved: boolean;
  /** estimated litres lost per day while the leak runs (absent on older alerts) */
  wasteLitresPerDay?: number | null;
}

export const flatLabel = (f: Pick<FlatRec, "block" | "number">) => `${f.block}-${f.number}`;
