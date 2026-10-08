/**
 * Resident access codes. The committee issues one per flat; whoever holds it can view that flat
 * (usage, bills, alerts), read-only, with no account. Codes are 12 characters of Crockford base32
 * (60 random bits: guessing one is impractical), shown as K7M2-QX9P-4HDR. Only a SHA-256 hash is
 * stored, so the database never contains a usable code. Issuing a new code revokes the old one.
 */

// Crockford base32: no I, L, O or U, so codes are easy to read aloud and type
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 12;

export function generateAccessCode(random: (n: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(CODE_LENGTH);
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i++) raw += ALPHABET[bytes[i] & 31];
  return formatAccessCode(raw);
}

/** Uppercase, drop spaces/dashes, and forgive the look-alikes people type (O→0, I/L→1). */
export function normalizeAccessCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export const isWellFormedAccessCode = (input: string) => new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(normalizeAccessCode(input));

export function formatAccessCode(input: string): string {
  return (normalizeAccessCode(input).match(/.{1,4}/g) ?? []).join("-");
}

/** hex SHA-256 of the normalized code (Web Crypto: works in Lambda and the browser) */
export async function hashAccessCode(input: string): Promise<string> {
  const data = new TextEncoder().encode(`aqualedger-flat-access:${normalizeAccessCode(input)}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The link a committee shares (WhatsApp, SMS, printed on the bill). */
export function residentLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/resident/?code=${formatAccessCode(code)}`;
}
