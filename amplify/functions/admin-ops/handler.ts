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
import { generateAccessCode, hashAccessCode, residentLink } from "../../../lib/core/access";
import type { FlatRec } from "../../../lib/core/types";
import { batchPut, ddb, getSociety, listFlats, putItem, queryAll, T, setFlatAccess, type SocietyRec } from "../shared/db";
import { assertSocietyAdmin, cognito, emailOf, usernameOf, type ResolverEvent } from "../shared/identity";
import { subscribeAdminEmail } from "../shared/notify";
import { explainSendError, sendEmail, senderEmail } from "../shared/mail";
import { accessEmail, SEND_BATCH } from "../../../lib/core/residents";
import { explainWhatsAppError, sendWhatsApp, whatsappPhoneId } from "../shared/whatsapp";

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
    case "sendResidentAccess":
      assertSocietyAdmin(event.identity, a.societyId);
      return sendResidentAccess(a.societyId, a.flatIds ?? [], String(a.origin ?? ""), Boolean(a.replaceExisting));
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
  const [flat, society] = await Promise.all([flatInSociety(societyId, flatId), getSociety(societyId)]);
  const code = generateAccessCode();
  const issuedAt = new Date().toISOString();
  await setFlatAccess(flatId, await hashAccessCode(code), issuedAt);
  return { code, flat: `${flat.block}-${flat.number}`, issuedAt, society: society?.name };
}

async function revokeResidentAccess(societyId: string, flatId: string) {
  const flat = await flatInSociety(societyId, flatId);
  await setFlatAccess(flatId, null);
  return { ok: true, flat: `${flat.block}-${flat.number}` };
}

type SendResult = {
  flatId: string;
  flat: string;
  /** sent: delivered automatically to someone; manual: WhatsApp numbers waiting for the committee's tap */
  status: "sent" | "manual" | "skipped" | "failed";
  sentTo: string[];
  /** numbers the committee sends to from its own WhatsApp (when automatic WhatsApp is off or failed) */
  manualPhones?: string[];
  /** the new code, for those manual WhatsApp messages; the committee may see it anyway (Give access) */
  code?: string;
  reason?: string;
};

/**
 * Sends each flat's residents a fresh access code: their login is the flat number plus the code.
 * Emails go through SES and WhatsApp through End User Messaging Social when those are set up;
 * numbers that can't be messaged automatically come back as "manual" with the code, and the
 * committee sends them from its own WhatsApp in one tap each. The code is stored only as a hash,
 * so sending means issuing a new one; flats that already have access are skipped unless
 * replaceExisting is set. If nobody could be reached, the flat's previous access is put back.
 */
async function sendResidentAccess(societyId: string, flatIds: string[], origin: string, replaceExisting: boolean) {
  const base = origin.replace(/\/$/, "");
  if (!/^https?:\/\/[^\s/]+$/.test(base)) throw new Error("Invalid site address");
  if (flatIds.length > SEND_BATCH) throw new Error(`Send at most ${SEND_BATCH} flats per request`);
  const society = await getSociety(societyId);
  if (!society) throw new Error("Society not found");
  const emailOn = Boolean(senderEmail());
  const whatsappOn = Boolean(whatsappPhoneId());

  const results: SendResult[] = [];
  for (const flatId of flatIds) {
    let flat: FlatRec;
    try {
      flat = await flatInSociety(societyId, flatId);
    } catch (err) {
      results.push({ flatId, flat: "?", status: "failed", sentTo: [], reason: (err as Error).message });
      continue;
    }
    const label = `${flat.block}-${flat.number}`;
    const emails = (flat.residentEmails ?? []).filter((e): e is string => Boolean(e));
    const phones = (flat.residentPhones ?? []).filter((p): p is string => Boolean(p));
    if (!phones.length && !(emailOn && emails.length)) {
      results.push({
        flatId,
        flat: label,
        status: "skipped",
        sentTo: [],
        reason: emails.length ? "Only emails on file, and email sending isn't set up" : "No email or mobile on file",
      });
      continue;
    }
    if (flat.accessCodeHash && !replaceExisting) {
      results.push({ flatId, flat: label, status: "skipped", sentTo: [], reason: "Already has access" });
      continue;
    }

    const previous = { hash: flat.accessCodeHash ?? null, at: flat.accessIssuedAt ?? undefined };
    const code = generateAccessCode();
    await setFlatAccess(flatId, await hashAccessCode(code));
    const link = residentLink(base, code);
    const sentTo: string[] = [];
    const manualPhones: string[] = [];
    const errors: string[] = [];

    if (emailOn) {
      const mail = accessEmail({ societyName: society.name, flat: label, code, link, portalUrl: `${base}/resident/` });
      for (const to of emails) {
        try {
          await sendEmail(to, mail);
          sentTo.push(to);
        } catch (err) {
          console.error("SES send failed", to, err);
          errors.push(`${to}: ${explainSendError(err)}`);
        }
      }
    }
    for (const to of phones) {
      if (!whatsappOn) {
        manualPhones.push(to);
        continue;
      }
      try {
        await sendWhatsApp({ to, societyName: society.name, flat: label, code, link });
        sentTo.push(to);
      } catch (err) {
        console.error("WhatsApp send failed", to, err);
        errors.push(`${to}: ${explainWhatsAppError(err)}`);
        manualPhones.push(to); // the committee can still send it from its own WhatsApp
      }
    }

    if (!sentTo.length && !manualPhones.length) {
      // nobody received the new code: keep the old one working
      await setFlatAccess(flatId, previous.hash, previous.at);
      results.push({ flatId, flat: label, status: "failed", sentTo, reason: errors.join(" · ") });
      continue;
    }
    results.push({
      flatId,
      flat: label,
      status: sentTo.length ? "sent" : "manual",
      sentTo,
      ...(manualPhones.length ? { manualPhones, code } : {}),
      ...(errors.length ? { reason: `Not delivered to ${errors.join(" · ")}` } : {}),
    });
  }
  return { results, email: emailOn, whatsapp: whatsappOn, society: society.name };
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
