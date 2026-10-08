"use client";

import { generateClient } from "aws-amplify/data";
import { fetchAuthSession } from "aws-amplify/auth";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";
import { DEMO_SOCIETY_ID, demoClient, demoIngest } from "@/lib/demo/backend";

/** `npm run demo`: everything runs in the browser against lib/demo/backend.ts, no AWS needed. */
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

/** true when amplify_outputs.json describes a deployed backend (not the placeholder) */
const realOutputs = outputs as { auth?: { user_pool_id?: string }; data?: { url?: string } };
export const BACKEND_READY = DEMO || Boolean(realOutputs.auth?.user_pool_id && realOutputs.data?.url);

type DataClient = ReturnType<typeof generateClient<Schema>>;
export const client: DataClient = DEMO || !BACKEND_READY ? (demoClient as unknown as DataClient) : generateClient<Schema>();

/** a.json() results can arrive as a JSON string or an object depending on the path. */
export function parseJson<T>(v: unknown): T {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return v as T;
    }
  }
  return v as T;
}

/** Unwraps an Amplify data response, throwing the first GraphQL error. */
export function unwrap<T>(res: { data?: unknown; errors?: { message: string }[] | null }): T {
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join("; "));
  return parseJson<T>(res.data);
}

const STATIC_GROUPS = new Set(["ADMINS", "RESIDENTS"]);

export async function getRoles(forceRefresh = false) {
  if (DEMO) return { groups: [DEMO_SOCIETY_ID, "ADMINS"], societyIds: [DEMO_SOCIETY_ID], isAdmin: true, isResident: false };
  const session = await fetchAuthSession({ forceRefresh });
  const raw = session.tokens?.accessToken.payload["cognito:groups"];
  const groups = Array.isArray(raw) ? (raw as string[]) : [];
  return {
    groups,
    societyIds: groups.filter((g) => !STATIC_GROUPS.has(g)),
    isAdmin: groups.includes("ADMINS"),
    isResident: groups.includes("RESIDENTS"),
  };
}

export const meterIngestUrl: string | undefined = DEMO ? "demo://meter-ingest" : (outputs as { custom?: { meterIngestUrl?: string } }).custom?.meterIngestUrl;

/** Posts one smart-meter reading, exactly like scripts/meter_simulator.py does. */
export async function postMeterReading(body: { societyId: string; flat: string; litres: number; periodMinutes: number }, token: string) {
  if (DEMO) return demoIngest(body, token);
  const res = await fetch(meterIngestUrl!, {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-token": token },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

export const inr = (n: number | null | undefined) => `₹${Math.round(n ?? 0).toLocaleString("en-IN")}`;
export const kl = (litres: number | null | undefined, dp = 1) =>
  `${(Math.round(((litres ?? 0) / 1000) * 10 ** dp) / 10 ** dp).toLocaleString("en-IN")} kL`;
/** "7 Oct 2026" from a YYYY-MM-DD date */
export const fmtDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export const litresFmt = (n: number | null | undefined) => `${Math.round(n ?? 0).toLocaleString("en-IN")} L`;

type Page<T> = { data: T[]; nextToken?: string | null; errors?: { message: string }[] | null };

/** Follows nextToken until every page of an Amplify list query is loaded (or `max` items). */
export async function listAll<T>(fetchPage: (nextToken: string | null | undefined) => Promise<Page<T>>, max = 5000): Promise<T[]> {
  const out: T[] = [];
  let token: string | null | undefined;
  do {
    const page = await fetchPage(token);
    if (page.errors?.length) throw new Error(page.errors.map((e) => e.message).join("; "));
    out.push(...page.data);
    token = page.nextToken;
  } while (token && out.length < max);
  return out;
}

export type FlatModel = Schema["Flat"]["type"];
export type BillModel = Schema["Bill"]["type"];
export type AlertModel = Schema["Alert"]["type"];

export async function loadFlats(societyId: string) {
  const flats = await listAll<FlatModel>((nextToken) => client.models.Flat.listFlatsBySociety({ societyId }, { nextToken, limit: 500 }));
  return flats.sort((a, b) => a.block.localeCompare(b.block) || Number(a.number) - Number(b.number) || a.number.localeCompare(b.number));
}

export const flatLabelOf = (f: { block: string; number: string }) => `${f.block}-${f.number}`;
