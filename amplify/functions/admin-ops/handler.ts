import { randomBytes, randomUUID } from "node:crypto";
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  CreateGroupCommand,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";
import { BatchWriteCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { generateFlats, generateSeed } from "../../../lib/core/seed";
import { parseReadingsCsv } from "../../../lib/core/csv";
import { generateAccessCode, hashAccessCode } from "../../../lib/core/access";
import type { FlatRec } from "../../../lib/core/types";
import { batchPut, ddb, getSociety, listFlats, putItem, queryAll, T, setFlatAccess, type SocietyRec } from "../shared/db";
import { assertSocietyAdmin, cognito, emailOf, usernameOf, type ResolverEvent } from "../shared/identity";
import { subscribeAdminEmail } from "../shared/notify";

type Args = Record<string, any>;
const USER_POOL_ID = () => process.env.USER_POOL_ID!;

export const handler = async (event: ResolverEvent<Args>) => {
  const a = event.arguments;
  switch (event.fieldName) {
    case "setupSociety":
      return setupSociety(event.identity, a);
    case "seedDemoData":
      assertSocietyAdmin(event.identity, a.societyId);
      return seedDemoData(a.societyId);
    case "issueResidentAccess":
      assertSocietyAdmin(event.identity, a.societyId);
      return issueResidentAccess(a.societyId, a.flatId);
    case "revokeResidentAccess":
      assertSocietyAdmin(event.identity, a.societyId);
      return revokeResidentAccess(a.societyId, a.flatId);
    case "inviteAdmin":
      assertSocietyAdmin(event.identity, a.societyId);
      return inviteAdmin(a.societyId, a.email);
    case "importReadingsCsv":
      assertSocietyAdmin(event.identity, a.societyId);
      return importCsv(a.societyId, a.csv);
    default:
      throw new Error(`Unknown field ${event.fieldName}`);
  }
};

async function addToGroup(username: string, group: string) {
  await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: USER_POOL_ID(), Username: username, GroupName: group }));
}

async function setupSociety(identity: unknown, a: Args) {
  const username = usernameOf(identity);
  const email = await emailOf(identity);
  const blocks: string[] = (a.blocks as string[]).map((b) => b.trim().toUpperCase()).filter(Boolean);
  const perBlock = Math.min(Math.max(Number(a.flatsPerBlock) || 1, 1), 60);
  if (!blocks.length) throw new Error("Add at least one block");
  if (blocks.length * perBlock > 2000) throw new Error("Up to 2,000 flats per society");

  const societyId = randomUUID();
  const society: SocietyRec = {
    societyId,
    name: a.name,
    city: a.city ?? undefined,
    flatCount: blocks.length * perBlock,
    commonCharge: a.commonCharge ?? 150,
    tzOffsetMinutes: 330,
    deviceToken: randomBytes(18).toString("base64url"),
    adminEmails: [email],
  };
  // Write all the data first and grant access last: if anything fails part-way, the user is not
  // left as admin of a half-built society, and simply retrying creates a clean one.
  await putItem("Society", society);
  let result: Record<string, unknown>;
  if (a.seedDemo) {
    result = await seedDemoData(societyId, blocks, perBlock);
  } else {
    const flats = generateFlats(societyId, blocks, perBlock);
    await batchPut("Flat", flats);
    result = { flats: flats.length, seeded: false };
  }

  // The society's own Cognito group is what the data-layer auth rules check.
  await cognito.send(new CreateGroupCommand({ UserPoolId: USER_POOL_ID(), GroupName: societyId, Description: `Admins of ${a.name}` }));
  await addToGroup(username, societyId);
  await addToGroup(username, "ADMINS");
  await subscribeAdminEmail(societyId, email).catch((err) => console.error("SNS subscribe failed", err));
  return { societyId, ...result };
}

/**
 * Loads (or resets) the demo: flats, ~6 months of readings with summer spikes and a planted
 * leak in B-202, municipal/borewell supply and tanker deliveries. Ids are deterministic, so
 * running it again overwrites the same items; alerts, bills and insights are cleared.
 */
async function seedDemoData(societyId: string, blocks?: string[], perBlock?: number) {
  if (!blocks || !perBlock) {
    const existing = await listFlats(societyId);
    const byBlock = new Map<string, number>();
    for (const f of existing) byBlock.set(f.block, (byBlock.get(f.block) ?? 0) + 1);
    blocks = byBlock.size ? [...byBlock.keys()].sort() : ["A", "B", "C", "D"];
    perBlock = byBlock.size ? Math.max(...byBlock.values()) : 10;
  }
  const seed = generateSeed({ societyId, blocks, flatsPerBlock: perBlock });
  await Promise.all([
    clearSociety("Alert", "bySocietyDetected", societyId),
    clearSociety("Bill", "bySocietyMonth", societyId),
    clearSociety("Insight", "bySocietyMonth", societyId),
  ]);
  await batchPut("Flat", seed.flats);
  await Promise.all([batchPut("Reading", seed.readings), batchPut("SourceSupply", seed.supplies), batchPut("TankerDelivery", seed.tankers)]);
  const leak = seed.flats.find((f) => f.id === seed.leakFlatId)!;
  return {
    seeded: true,
    flats: seed.flats.length,
    readings: seed.readings.length,
    tankers: seed.tankers.length,
    leakFlat: `${leak.block}-${leak.number}`,
  };
}

async function clearSociety(typename: "Alert" | "Bill" | "Insight", index: string, societyId: string) {
  const items = await queryAll<{ id: string }>({
    TableName: T[typename],
    IndexName: index,
    KeyConditionExpression: "societyId = :s",
    ExpressionAttributeValues: { ":s": societyId },
    ProjectionExpression: "id",
  });
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await ddb.send(new BatchWriteCommand({ RequestItems: { [T[typename]]: chunk.map((it) => ({ DeleteRequest: { Key: { id: it.id } } })) } }));
  }
}

/** Creates (or reuses) the Cognito user and emails them a temporary password. */
async function ensureUser(email: string): Promise<boolean> {
  try {
    // Cognito emails a temporary password (default Cognito sender: free, ~50 emails/day).
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID(),
        Username: email,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
        ],
        DesiredDeliveryMediums: ["EMAIL"],
      })
    );
    return true;
  } catch (err) {
    if (!(err instanceof UsernameExistsException)) throw err;
    return false; // existing account: just grant access
  }
}

/** Another committee member: full admin of this society, and gets its alert emails. */
async function inviteAdmin(societyId: string, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const society = await getSociety(societyId);
  if (!society) throw new Error("Society not found");
  const invited = await ensureUser(email);
  await addToGroup(email, societyId);
  await addToGroup(email, "ADMINS");
  const adminEmails = [...new Set([...(society.adminEmails ?? []), email])];
  await ddb.send(
    new UpdateCommand({
      TableName: T.Society,
      Key: { societyId },
      UpdateExpression: "SET adminEmails = :a, updatedAt = :u",
      ExpressionAttributeValues: { ":a": adminEmails, ":u": new Date().toISOString() },
    })
  );
  await subscribeAdminEmail(societyId, email).catch((err) => console.error("SNS subscribe failed", err));
  return { ok: true, invited, email, adminEmails };
}

async function flatInSociety(societyId: string, flatId: string) {
  const flat = (await ddb.send(new GetCommand({ TableName: T.Flat, Key: { id: flatId } }))).Item as FlatRec | undefined;
  if (!flat || flat.societyId !== societyId) throw new Error("Flat not found in this society");
  return flat;
}

/**
 * Gives a flat's residents access: a fresh code (returned once, never stored) replaces any
 * previous one, so issuing again is also how the committee revokes a lost or old code.
 */
async function issueResidentAccess(societyId: string, flatId: string) {
  const flat = await flatInSociety(societyId, flatId);
  const code = generateAccessCode();
  const issuedAt = new Date().toISOString();
  await setFlatAccess(flatId, await hashAccessCode(code), issuedAt);
  return { code, flat: `${flat.block}-${flat.number}`, issuedAt };
}

async function revokeResidentAccess(societyId: string, flatId: string) {
  const flat = await flatInSociety(societyId, flatId);
  await setFlatAccess(flatId, null);
  return { ok: true, flat: `${flat.block}-${flat.number}` };
}

async function importCsv(societyId: string, csv: string) {
  if (csv.length > 1_500_000) throw new Error("CSV too large: upload at most ~1.5 MB (one month for a large society) at a time");
  const society = await getSociety(societyId);
  const flats = await listFlats(societyId);
  const { rows, errors } = parseReadingsCsv(csv, flats, society?.tzOffsetMinutes ?? 330);
  if (rows.length > 50_000) throw new Error(`CSV has ${rows.length} readings; upload at most 50,000 at a time`);
  await batchPut(
    "Reading",
    rows.map((r) => ({ id: randomUUID(), societyId, source: "csv", ...r }))
  );
  return { imported: rows.length, errors: errors.slice(0, 25), errorCount: errors.length };
}
