/**
 * Resident email lists, and the access email each resident receives. The committee pastes or
 * uploads its own register ("A-101, rahul@example.com"); AquaLedger matches each row to a flat and
 * emails that flat's residents their login: the flat number and its access code.
 */

import { formatAccessCode } from "./access";

export const MAX_EMAILS_PER_FLAT = 6;
/** flats per emailResidentAccess call: keeps each call well inside the Lambda timeout */
export const EMAIL_BATCH = 10;

const EMAIL = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[A-Za-z]{2,}$/;
export const isEmail = (s: string) => s.length <= 254 && EMAIL.test(s);

/** "A-101", "a 101", "A/101" and "A101" all name the same flat */
export const flatKey = (label: string) => label.toUpperCase().replace(/[^0-9A-Z]/g, "");

export interface ParsedResidentEmails {
  /** flatId -> emails, in file order, de-duplicated */
  byFlat: Map<string, string[]>;
  /** flat names in the file that don't exist in this society */
  unknownFlats: string[];
  /** text that looked like an email but isn't one */
  badEmails: string[];
  /** flats that had more than MAX_EMAILS_PER_FLAT addresses (the rest were dropped) */
  truncated: string[];
}

/**
 * Accepts what a committee typically has: one row per resident or per flat, separated by commas,
 * semicolons or tabs; the flat as "A-101" or as separate block and number columns; an optional
 * header row; several emails in one cell. A flat listed on several rows gets all their emails.
 */
export function parseResidentEmails(text: string, flats: { id: string; block: string; number: string }[]): ParsedResidentEmails {
  const index = new Map(flats.map((f) => [flatKey(`${f.block}${f.number}`), f]));
  const byFlat = new Map<string, string[]>();
  const unknownFlats: string[] = [];
  const badEmails: string[] = [];
  const truncated = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const cells = rawLine
      .split(/[,;\t|]/)
      .flatMap((c) => c.trim().split(/\s+(?=\S+@)/)) // "a@x.com b@y.com" in one cell
      .map((c) => c.trim().replace(/^["']|["']$/g, "").trim())
      .filter(Boolean);
    if (!cells.length) continue;
    const emailCells = cells.filter((c) => c.includes("@"));
    const flatCells = cells.filter((c) => !c.includes("@"));
    if (!emailCells.length) continue; // a header row, or a flat with no email yet

    // "A-101" in one column, or "A" and "101" in two: try the combinations, longest first
    let flat: { id: string; block: string; number: string } | undefined;
    for (let n = Math.min(flatCells.length, 2); n >= 1 && !flat; n--) {
      for (let i = 0; i + n <= flatCells.length && !flat; i++) flat = index.get(flatKey(flatCells.slice(i, i + n).join("")));
    }
    if (!flat) {
      const name = flatCells.slice(0, 2).join("-") || "(no flat)";
      if (!unknownFlats.includes(name)) unknownFlats.push(name);
      continue;
    }

    const list = byFlat.get(flat.id) ?? [];
    for (const raw of emailCells) {
      const email = raw.toLowerCase();
      if (!isEmail(email)) {
        badEmails.push(raw);
        continue;
      }
      if (list.includes(email)) continue;
      if (list.length >= MAX_EMAILS_PER_FLAT) {
        truncated.add(`${flat.block}-${flat.number}`);
        continue;
      }
      list.push(email);
    }
    if (list.length) byFlat.set(flat.id, list);
  }
  return { byFlat, unknownFlats, badEmails, truncated: [...truncated] };
}

/** Parse a comma/space separated list typed into one box. */
export function parseEmailList(text: string): { emails: string[]; bad: string[] } {
  const emails: string[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[\s,;]+/).filter(Boolean)) {
    const e = raw.toLowerCase();
    if (!isEmail(e)) bad.push(raw);
    else if (!emails.includes(e)) emails.push(e);
  }
  return { emails: emails.slice(0, MAX_EMAILS_PER_FLAT), bad };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The email a resident receives: their "username" (society + flat) and "password" (the access code). */
export function accessEmail(o: { societyName: string; flat: string; code: string; link: string; portalUrl: string }) {
  const code = formatAccessCode(o.code);
  const subject = `Your AquaLedger login for flat ${o.flat} · ${o.societyName}`;
  const text = [
    `Hello,`,
    ``,
    `${o.societyName} uses AquaLedger to share water usage and bills. Here is the login for your flat:`,
    ``,
    `  Flat:         ${o.flat}`,
    `  Access code:  ${code}`,
    ``,
    `Open your flat: ${o.link}`,
    `(or go to ${o.portalUrl} and enter the code)`,
    ``,
    `There's no password to set. Everyone living in ${o.flat} shares this code, so keep it within your household.`,
    `If it's lost or shared by mistake, ask your society committee for a new one; the old code then stops working.`,
    ``,
    `— ${o.societyName} committee, via AquaLedger`,
  ].join("\n");
  const e = { society: escapeHtml(o.societyName), flat: escapeHtml(o.flat), link: escapeHtml(o.link), portal: escapeHtml(o.portalUrl) };
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<div style="background:#0d9488;color:#ffffff;padding:20px 24px"><div style="font-size:14px;opacity:.85">💧 AquaLedger · ${e.society}</div><div style="font-size:20px;font-weight:600;margin-top:4px">Your login for flat ${e.flat}</div></div>
<div style="padding:24px;font-size:15px;line-height:1.5">
<p style="margin:0 0 16px">${e.society} uses AquaLedger to share water usage and bills. You don't need to create an account or set a password.</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:15px">
<tr><td style="padding:8px 0;color:#64748b">Flat</td><td style="padding:8px 0;font-weight:600;text-align:right">${e.flat}</td></tr>
<tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">Access code</td><td style="padding:8px 0;border-top:1px solid #e2e8f0;text-align:right;font-family:Menlo,Consolas,monospace;font-size:18px;font-weight:700;letter-spacing:2px">${code}</td></tr>
</table>
<a href="${e.link}" style="display:block;text-align:center;background:#059669;color:#ffffff;text-decoration:none;font-weight:600;padding:14px;border-radius:12px">Open my flat</a>
<p style="margin:16px 0 0;font-size:13px;color:#64748b">Or go to <a href="${e.portal}" style="color:#0f766e">${e.portal}</a> and enter the code. Everyone living in ${e.flat} shares this code, so keep it within your household. If it's lost, ask your committee for a new one; the old code then stops working.</p>
</div></div></div></body></html>`;
  return { subject, text, html };
}
