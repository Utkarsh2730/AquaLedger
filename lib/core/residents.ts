/**
 * Resident contact lists, and the login message each resident receives. The committee pastes or
 * uploads its own register ("A-101, rahul@example.com, 98765 43210"); AquaLedger matches each row
 * to a flat and sends that flat's residents their login, by email and/or WhatsApp: the flat number
 * and its access code.
 */

import { formatAccessCode } from "./access";

export const MAX_EMAILS_PER_FLAT = 6;
export const MAX_PHONES_PER_FLAT = 6;
/** flats per sendResidentAccess call: keeps each call well inside the Lambda timeout */
export const SEND_BATCH = 10;

const EMAIL = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[A-Za-z]{2,}$/;
export const isEmail = (s: string) => s.length <= 254 && EMAIL.test(s);

/**
 * Mobile number in E.164 ("+919876543210"), or null. Written the Indian way by default: a bare
 * 10-digit number (or one with a leading 0) gets +91; numbers with + or 00 keep their country code.
 */
export function normalizePhone(raw: string, defaultCountryCode = "91"): string | null {
  let s = raw.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
  if (!/^\d+$/.test(s)) return null;
  if (s.length === 11 && s.startsWith("0")) s = s.slice(1);
  if (s.length === 10) return /^[6-9]/.test(s) || defaultCountryCode !== "91" ? `+${defaultCountryCode}${s}` : null;
  if (s.length === 12 && s.startsWith(defaultCountryCode)) return `+${s}`;
  return null;
}

/** "+91 98765 43210" for display */
export function formatPhone(e164: string): string {
  const m = e164.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

const phoneLike = (cell: string) => /^[\d\s+\-().\/]+$/.test(cell) && cell.replace(/\D/g, "").length >= 7;

/** "A-101", "a 101", "A/101" and "A101" all name the same flat */
export const flatKey = (label: string) => label.toUpperCase().replace(/[^0-9A-Z]/g, "");

export interface ResidentContacts {
  emails: string[];
  phones: string[];
}

export interface ParsedResidentContacts {
  /** flatId -> contacts, in file order, de-duplicated */
  byFlat: Map<string, ResidentContacts>;
  /** flat names in the file that don't exist in this society */
  unknownFlats: string[];
  /** text that looked like an email but isn't one */
  badEmails: string[];
  /** text that looked like a mobile number but isn't one */
  badPhones: string[];
  /** flats that had more than 6 emails or numbers (the rest were dropped) */
  truncated: string[];
}

/**
 * Accepts what a committee typically has: one row per resident or per flat, separated by commas,
 * semicolons or tabs; the flat as "A-101" or as separate block and number columns; an optional
 * header row; emails and/or mobile numbers, several in one cell if needed. A flat listed on several
 * rows gets all their contacts.
 */
export function parseResidentContacts(text: string, flats: { id: string; block: string; number: string }[]): ParsedResidentContacts {
  const index = new Map(flats.map((f) => [flatKey(`${f.block}${f.number}`), f]));
  const byFlat = new Map<string, ResidentContacts>();
  const unknownFlats: string[] = [];
  const badEmails: string[] = [];
  const badPhones: string[] = [];
  const truncated = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const cells = rawLine
      .split(/[,;\t|]/)
      .flatMap((c) => c.trim().split(/\s+(?=\S+@)/)) // "a@x.com b@y.com" in one cell
      .map((c) => c.trim().replace(/^["']|["']$/g, "").trim())
      .filter(Boolean);
    if (!cells.length) continue;
    const emailCells = cells.filter((c) => c.includes("@"));
    const phoneCells = cells
      .filter((c) => !c.includes("@") && phoneLike(c))
      // "98765 43210 / 91234 56789" or two numbers separated by a space
      .flatMap((c) => c.split("/"))
      .flatMap((c) => (c.replace(/\D/g, "").length > 13 && !normalizePhone(c) ? c.trim().split(/\s+/) : [c]))
      .map((c) => c.trim())
      .filter(Boolean);
    const flatCells = cells.filter((c) => !c.includes("@") && !phoneLike(c));
    if (!emailCells.length && !phoneCells.length) continue; // a header row, or a flat with no contact yet

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

    const label = `${flat.block}-${flat.number}`;
    const entry = byFlat.get(flat.id) ?? { emails: [], phones: [] };
    const add = (list: string[], value: string, max: number) => {
      if (list.includes(value)) return;
      if (list.length >= max) truncated.add(label);
      else list.push(value);
    };
    for (const raw of emailCells) {
      const email = raw.toLowerCase();
      if (isEmail(email)) add(entry.emails, email, MAX_EMAILS_PER_FLAT);
      else badEmails.push(raw);
    }
    for (const raw of phoneCells) {
      const phone = normalizePhone(raw);
      if (phone) add(entry.phones, phone, MAX_PHONES_PER_FLAT);
      else badPhones.push(raw);
    }
    if (entry.emails.length || entry.phones.length) byFlat.set(flat.id, entry);
  }
  return { byFlat, unknownFlats, badEmails, badPhones, truncated: [...truncated] };
}

/** Parse mobile numbers typed into one box, separated by commas or slashes. */
export function parsePhoneList(text: string): { phones: string[]; bad: string[] } {
  const phones: string[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[,;\/\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const p = normalizePhone(raw);
    if (!p) bad.push(raw);
    else if (!phones.includes(p)) phones.push(p);
  }
  return { phones: phones.slice(0, MAX_PHONES_PER_FLAT), bad };
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

/** The WhatsApp version of the login: same details, plain text. */
export function whatsappText(o: { societyName: string; flat: string; code: string; link: string }) {
  return [
    `Hello! ${o.societyName} uses AquaLedger to share water usage and bills.`,
    ``,
    `Your login for flat ${o.flat}:`,
    `Access code: ${formatAccessCode(o.code)}`,
    ``,
    `Open your flat: ${o.link}`,
    ``,
    `There is no password to set. Keep this code within your household; if it's lost, ask the committee for a new one.`,
  ].join("\n");
}

/** Click-to-chat link: opens WhatsApp with the message ready to send to that number (free, no API). */
export const whatsappLink = (phone: string | null, text: string) => `https://wa.me/${phone ? phone.replace(/\D/g, "") : ""}?text=${encodeURIComponent(text)}`;

/**
 * Automatic sending goes through the WhatsApp Business Platform (AWS End User Messaging Social),
 * where messages a business starts must use a template Meta has approved. This is that template;
 * the System check submits it for review if it's missing.
 */
export const WHATSAPP_TEMPLATE = {
  name: "aqualedger_login",
  language: "en",
  category: "UTILITY",
  body:
    "Hello! {{1}} uses AquaLedger to share water usage and bills.\n\nYour login for flat {{2}}:\nAccess code: {{3}}\n\nOpen your flat: {{4}}\n\nThere is no password to set. Keep this code within your household; if it's lost, ask the committee for a new one.",
  example: ["Green Meadows CHS", "A-101", "K7M2-QX9P-4HDR", "https://example.com/resident/?code=K7M2-QX9P-4HDR"],
};

export function whatsappTemplateDefinition(name = WHATSAPP_TEMPLATE.name, language = WHATSAPP_TEMPLATE.language) {
  return {
    name,
    language,
    category: WHATSAPP_TEMPLATE.category,
    components: [{ type: "BODY", text: WHATSAPP_TEMPLATE.body, example: { body_text: [WHATSAPP_TEMPLATE.example] } }],
  };
}

/** Cloud API payload for one login message (the {{1}}..{{4}} values of the template above) */
export function whatsappTemplateMessage(o: { to: string; societyName: string; flat: string; code: string; link: string; template?: string; language?: string }) {
  return {
    messaging_product: "whatsapp",
    to: o.to,
    type: "template",
    template: {
      name: o.template || WHATSAPP_TEMPLATE.name,
      language: { code: o.language || WHATSAPP_TEMPLATE.language },
      components: [
        {
          type: "body",
          parameters: [o.societyName, o.flat, formatAccessCode(o.code), o.link].map((text) => ({ type: "text", text })),
        },
      ],
    },
  };
}
