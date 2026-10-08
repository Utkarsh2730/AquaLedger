"use client";

import { generateClient } from "aws-amplify/data";
import { fetchAuthSession } from "aws-amplify/auth";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";

export const client = generateClient<Schema>();

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

export const meterIngestUrl: string | undefined = (outputs as { custom?: { meterIngestUrl?: string } }).custom?.meterIngestUrl;

export const inr = (n: number | null | undefined) => `₹${Math.round(n ?? 0).toLocaleString("en-IN")}`;
export const kl = (litres: number | null | undefined, dp = 1) =>
  `${(Math.round(((litres ?? 0) / 1000) * 10 ** dp) / 10 ** dp).toLocaleString("en-IN")} kL`;
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
