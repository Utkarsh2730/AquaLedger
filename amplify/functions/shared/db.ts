import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type { AlertRec, BillRec, FlatRec, ReadingRec, SupplyRec, TankerRec } from "../../../lib/core/types";
import type { SocietyData } from "../../../lib/core/summary";

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** Table names are injected by amplify/backend.ts. */
export const T = {
  Society: process.env.TABLE_SOCIETY!,
  Flat: process.env.TABLE_FLAT!,
  Reading: process.env.TABLE_READING!,
  TankerDelivery: process.env.TABLE_TANKER!,
  SourceSupply: process.env.TABLE_SUPPLY!,
  Bill: process.env.TABLE_BILL!,
  Alert: process.env.TABLE_ALERT!,
  Insight: process.env.TABLE_INSIGHT!,
};
export type TypeName = keyof typeof T;

export interface SocietyRec {
  societyId: string;
  lastNightlyScanAt?: string;
  name: string;
  city?: string;
  flatCount?: number;
  commonCharge?: number;
  tzOffsetMinutes?: number;
  deviceToken?: string;
  adminEmails?: string[];
}

/** Adds the bookkeeping attributes AppSync/Amplify expect on every item. */
export function toItem<T extends object>(typename: TypeName, rec: T, now = new Date().toISOString()) {
  return { ...rec, __typename: typename, createdAt: now, updatedAt: now };
}

export async function putItem(typename: TypeName, rec: object) {
  await ddb.send(new PutCommand({ TableName: T[typename], Item: toItem(typename, rec) }));
}

/** BatchWrite in chunks of 25 with limited parallelism and retry of unprocessed items. */
export async function batchPut(typename: TypeName, recs: object[], parallel = 16) {
  const now = new Date().toISOString();
  const chunks: object[][] = [];
  for (let i = 0; i < recs.length; i += 25) chunks.push(recs.slice(i, i + 25));
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      let requests = chunk.map((r) => ({ PutRequest: { Item: toItem(typename, r, now) } }));
      for (let attempt = 0; requests.length && attempt < 8; attempt++) {
        if (attempt) await new Promise((res) => setTimeout(res, 50 * 2 ** attempt));
        const out = await ddb.send(new BatchWriteCommand({ RequestItems: { [T[typename]]: requests } }));
        requests = (out.UnprocessedItems?.[T[typename]] ?? []) as typeof requests;
      }
      if (requests.length) throw new Error(`batchPut ${typename}: ${requests.length} items left unprocessed`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, chunks.length) }, worker));
}

export async function queryAll<T>(input: QueryCommandInput): Promise<T[]> {
  const out: T[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(new QueryCommand({ ...input, ExclusiveStartKey }));
    out.push(...((page.Items ?? []) as T[]));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

export async function getSociety(societyId: string) {
  const out = await ddb.send(new GetCommand({ TableName: T.Society, Key: { societyId } }));
  return out.Item as SocietyRec | undefined;
}

export async function listSocieties() {
  const out: SocietyRec[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: T.Society, ExclusiveStartKey }));
    out.push(...((page.Items ?? []) as SocietyRec[]));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

export const listFlats = (societyId: string) =>
  queryAll<FlatRec>({ TableName: T.Flat, IndexName: "bySociety", KeyConditionExpression: "societyId = :s", ExpressionAttributeValues: { ":s": societyId } });

export const listReadings = (societyId: string, fromIso: string, toIso = "9999") =>
  queryAll<ReadingRec>({
    TableName: T.Reading,
    IndexName: "bySocietyTime",
    KeyConditionExpression: "societyId = :s AND #t BETWEEN :a AND :b",
    ExpressionAttributeNames: { "#t": "timestamp" },
    ExpressionAttributeValues: { ":s": societyId, ":a": fromIso, ":b": toIso },
  });

export const listFlatReadings = (flatId: string, fromIso: string) =>
  queryAll<ReadingRec>({
    TableName: T.Reading,
    IndexName: "byFlatTime",
    KeyConditionExpression: "flatId = :f AND #t >= :a",
    ExpressionAttributeNames: { "#t": "timestamp" },
    ExpressionAttributeValues: { ":f": flatId, ":a": fromIso },
  });

const byDate = <T>(table: string, index: string, societyId: string, from: string, attr = "date") =>
  queryAll<T>({
    TableName: table,
    IndexName: index,
    KeyConditionExpression: "societyId = :s AND #d >= :a",
    ExpressionAttributeNames: { "#d": attr },
    ExpressionAttributeValues: { ":s": societyId, ":a": from },
  });

export const listTankers = (societyId: string, fromDay: string) => byDate<TankerRec>(T.TankerDelivery, "bySocietyDate", societyId, fromDay);
export const listSupplies = (societyId: string, fromDay: string) => byDate<SupplyRec>(T.SourceSupply, "bySocietyDate", societyId, fromDay);
export const listAlerts = (societyId: string, fromIso: string) => byDate<AlertRec>(T.Alert, "bySocietyDetected", societyId, fromIso, "detectedAt");
export const listBillsForMonth = (societyId: string, month: string) =>
  queryAll<BillRec>({
    TableName: T.Bill,
    IndexName: "bySocietyMonth",
    KeyConditionExpression: "societyId = :s AND #m = :m",
    ExpressionAttributeNames: { "#m": "month" },
    ExpressionAttributeValues: { ":s": societyId, ":m": month },
  });

/** Everything the analytics need for a society, for the last `days` days. */
export async function loadSocietyData(societyId: string, days = 200): Promise<SocietyData> {
  const from = new Date(Date.now() - days * 86_400_000);
  const fromIso = from.toISOString();
  const fromDay = fromIso.slice(0, 10);
  const [flats, readings, tankers, supplies, alerts] = await Promise.all([
    listFlats(societyId),
    listReadings(societyId, fromIso),
    listTankers(societyId, fromDay),
    listSupplies(societyId, fromDay),
    listAlerts(societyId, new Date(Date.now() - 90 * 86_400_000).toISOString()),
  ]);
  return { societyId, flats, readings, tankers, supplies, alerts };
}

export async function markNightlyScan(societyId: string, at = new Date().toISOString()) {
  await ddb.send(
    new UpdateCommand({
      TableName: T.Society,
      Key: { societyId },
      UpdateExpression: "SET lastNightlyScanAt = :t, updatedAt = :t",
      ExpressionAttributeValues: { ":t": at },
    })
  );
}

export async function updateFlatResident(flatId: string, email: string) {
  await ddb.send(
    new UpdateCommand({
      TableName: T.Flat,
      Key: { id: flatId },
      UpdateExpression: "SET residentEmail = :e, updatedAt = :u",
      ExpressionAttributeValues: { ":e": email, ":u": new Date().toISOString() },
    })
  );
}
