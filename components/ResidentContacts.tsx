"use client";

import { useMemo, useRef, useState } from "react";
import { client, DEMO, flatLabelOf, residentEmailEnabled, residentWhatsAppEnabled, unwrap, type FlatModel, type SendAccessResult } from "@/lib/client";
import { residentLink } from "@/lib/core/access";
import { formatPhone, parseResidentContacts, SEND_BATCH, whatsappLink, whatsappText } from "@/lib/core/residents";
import { Button, Card, ErrorBox } from "./ui";

const EXAMPLE = `Flat, Name, Email, Mobile
A-101, Rahul Sharma, rahul.sharma@gmail.com, 98765 43210
A-101, Priya Sharma, priya.sharma@gmail.com, 91234 56789
A-102, Owner, owner@example.com
A-201, Tenant, , 98111 22233`;

type Preview = { to: string; subject: string; text: string };
type Tap = { key: string; flat: string; phone: string; href: string };

const listOf = (v: (string | null)[] | null | undefined) => (v ?? []).filter(Boolean) as string[];

/**
 * The committee pastes or uploads its resident register (emails and/or mobile numbers); AquaLedger
 * then sends every listed flat its login (flat number + access code) by email and WhatsApp. No
 * resident signs up or sets a password.
 */
export default function ResidentContacts({ societyId, flats, onChanged }: { societyId: string; flats: FlatModel[]; onChanged: () => Promise<unknown> }) {
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [replace, setReplace] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<SendAccessResult[] | null>(null);
  const [taps, setTaps] = useState<Tap[]>([]);
  const [tapped, setTapped] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (text.trim() ? parseResidentContacts(text, flats) : null), [text, flats]);
  const reachable = (f: FlatModel) => listOf(f.residentPhones).length > 0 || (residentEmailEnabled && listOf(f.residentEmails).length > 0);
  const withContacts = flats.filter((f) => listOf(f.residentEmails).length || listOf(f.residentPhones).length);
  const toSend = flats.filter((f) => reachable(f) && (replace || !f.accessIssuedAt));
  const notYet = withContacts.filter((f) => !f.accessIssuedAt).length;
  const parsedTotals = parsed
    ? [...parsed.byFlat.values()].reduce((t, c) => ({ emails: t.emails + c.emails.length, phones: t.phones + c.phones.length }), { emails: 0, phones: 0 })
    : null;

  async function save() {
    if (!parsed?.byFlat.size) return;
    setError(null);
    setSavedMsg(null);
    const entries = [...parsed.byFlat.entries()];
    try {
      for (let i = 0; i < entries.length; i += 5) {
        setSaving(`Saving ${Math.min(i + 5, entries.length)} of ${entries.length}…`);
        await Promise.all(
          entries.slice(i, i + 5).map(async ([id, c]) =>
            // a list with only emails leaves saved mobiles alone, and the other way round
            unwrap(await client.models.Flat.update({ id, ...(c.emails.length ? { residentEmails: c.emails } : {}), ...(c.phones.length ? { residentPhones: c.phones } : {}) }))
          )
        );
      }
      await onChanged();
      setSavedMsg(`Saved contacts for ${entries.length} flat${entries.length === 1 ? "" : "s"}.`);
      setText("");
      setImporting(false);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(null);
    }
  }

  async function send() {
    const ids = toSend.map((f) => f.id);
    if (!ids.length) return;
    const warn = replace && toSend.some((f) => f.accessIssuedAt) ? "\n\nFlats that already have a code get a new one; their old code stops working." : "";
    if (!confirm(`Send logins to the residents of ${ids.length} flat${ids.length === 1 ? "" : "s"}?${warn}`)) return;
    setError(null);
    setResults([]);
    setTaps([]);
    setTapped(new Set());
    setPreview(null);
    setProgress({ done: 0, total: ids.length });
    const all: SendAccessResult[] = [];
    const queue: Tap[] = [];
    try {
      for (let i = 0; i < ids.length; i += SEND_BATCH) {
        const res = unwrap<{ results: SendAccessResult[]; preview?: Preview; society?: string }>(
          await client.mutations.sendResidentAccess({ societyId, flatIds: ids.slice(i, i + SEND_BATCH), origin: window.location.origin, replaceExisting: replace })
        );
        all.push(...res.results);
        for (const r of res.results) {
          if (!r.code || !r.manualPhones?.length) continue;
          const message = whatsappText({ societyName: res.society ?? "Your society", flat: r.flat, code: r.code, link: residentLink(window.location.origin, r.code) });
          for (const phone of r.manualPhones) queue.push({ key: `${r.flatId}:${phone}`, flat: r.flat, phone, href: whatsappLink(phone, message) });
        }
        if (res.preview) setPreview((p) => p ?? res.preview!);
        setResults([...all]);
        setTaps([...queue]);
        setProgress({ done: Math.min(i + SEND_BATCH, ids.length), total: ids.length });
      }
    } catch (err) {
      setError(err);
    } finally {
      setProgress(null);
      await onChanged();
    }
  }

  const count = (s: SendAccessResult["status"]) => results?.filter((r) => r.status === s) ?? [];
  const autoSent = results?.reduce((n, r) => n + r.sentTo.length, 0) ?? 0;
  const problems = results?.filter((r) => r.status === "skipped" || r.status === "failed" || r.reason) ?? [];
  const nextTap = taps.find((t) => !tapped.has(t.key));
  const markTapped = (key: string) => setTapped((prev) => new Set(prev).add(key));

  return (
    <Card title="Send residents their login">
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          Add the resident emails and mobile numbers you already have, and AquaLedger sends each flat its login: the <b>flat number</b> and a private <b>access code</b>, by email
          and WhatsApp. Residents don&apos;t sign up or set a password.
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-slate-700">
          <span>
            <b>{withContacts.length}</b> of {flats.length} flats have resident contacts
          </span>
          <span>
            <b>{notYet}</b> of them haven&apos;t been sent a login yet
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 ${residentEmailEnabled ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
            ✉ Email: {residentEmailEnabled ? (DEMO ? "on (demo preview)" : "on") : "not set up"}
          </span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
            💬 WhatsApp: {residentWhatsAppEnabled ? "automatic" : "one tap per resident, from your phone"}
          </span>
        </div>
        <ErrorBox error={error} />
        {savedMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{savedMsg}</div>}

        {importing ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-slate-800">Paste your resident list, or upload it as a CSV</div>
              <input
                ref={file}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setText(await f.text());
                  e.target.value = "";
                }}
              />
              <Button variant="secondary" onClick={() => file.current?.click()}>
                Upload CSV
              </Button>
            </div>
            <textarea
              id="resident-contacts"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={EXAMPLE}
              rows={7}
              className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <p className="text-xs text-slate-500">
              One row per resident or per flat: the flat (A-101, or block and number in two columns), then emails and/or mobile numbers. Indian numbers can be written any usual way
              (98765 43210, 098765-43210, +91…). Other columns, like names, are ignored. Flats in the list get exactly these emails and numbers; everything else is left as it is.
            </p>
            {parsed && parsedTotals && (
              <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs">
                <div className="text-slate-800">
                  Matched <b>{parsed.byFlat.size}</b> flats: <b>{parsedTotals.emails}</b> emails, <b>{parsedTotals.phones}</b> mobile numbers.
                </div>
                {parsed.unknownFlats.length > 0 && <div className="text-amber-800">Not flats in this society (skipped): {parsed.unknownFlats.join(", ")}</div>}
                {parsed.badEmails.length > 0 && <div className="text-amber-800">Not valid emails (skipped): {parsed.badEmails.join(", ")}</div>}
                {parsed.badPhones.length > 0 && <div className="text-amber-800">Not valid mobile numbers (skipped): {parsed.badPhones.join(", ")}</div>}
                {parsed.truncated.length > 0 && <div className="text-amber-800">More than 6 emails or numbers, extra ones dropped: {parsed.truncated.join(", ")}</div>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={!parsed?.byFlat.size || Boolean(saving)}>
                {saving ?? `Save contacts${parsed?.byFlat.size ? ` for ${parsed.byFlat.size} flats` : ""}`}
              </Button>
              <Button variant="ghost" onClick={() => setImporting(false)} disabled={Boolean(saving)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => (setImporting(true), setSavedMsg(null))}>
              Add emails &amp; mobiles
            </Button>
            <Button onClick={send} disabled={!toSend.length || Boolean(progress)} className="bg-emerald-600 hover:bg-emerald-700">
              {progress ? `Sending… ${progress.done} of ${progress.total} flats` : `Send logins to ${toSend.length} flat${toSend.length === 1 ? "" : "s"}`}
            </Button>
            <label className="flex items-center gap-2 text-slate-600">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-4 w-4" />
              Also flats that already have access (gives them a new code)
            </label>
          </div>
        )}

        {!residentEmailEnabled && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            Email sending isn&apos;t switched on for this backend yet, so only mobile numbers get a login for now. To add email, set <code>AQUALEDGER_SENDER_EMAIL</code> to your
            society&apos;s address, redeploy, and click the link Amazon SES emails to it (Settings → System check walks you through it).
          </p>
        )}

        {results && results.length > 0 && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="font-medium text-slate-800">
              {count("sent").length + count("manual").length} flats got a new code
              {autoSent > 0 && ` · ${DEMO ? "prepared" : "sent"} ${autoSent} message${autoSent === 1 ? "" : "s"} automatically`}
              {taps.length > 0 && ` · ${taps.length} WhatsApp${taps.length === 1 ? "" : "s"} to send from your phone`}
              {count("skipped").length > 0 && ` · skipped ${count("skipped").length}`}
              {count("failed").length > 0 && <span className="text-rose-700"> · {count("failed").length} failed</span>}
            </div>

            {taps.length > 0 && (
              <div className="space-y-2 rounded-lg bg-emerald-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-emerald-900">
                    <b>WhatsApp from your phone:</b> {tapped.size} of {taps.length} opened. Each tap opens WhatsApp with the message ready; press send there.
                  </div>
                  {nextTap && (
                    <a
                      href={nextTap.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => markTapped(nextTap.key)}
                      className="inline-flex items-center rounded-lg bg-emerald-600 px-3.5 py-2 font-medium text-white hover:bg-emerald-700"
                    >
                      Next: {nextTap.flat} · {formatPhone(nextTap.phone)} →
                    </a>
                  )}
                </div>
                <ul className="max-h-56 divide-y divide-emerald-100 overflow-auto rounded-lg bg-white text-xs">
                  {taps.map((t) => (
                    <li key={t.key} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span>
                        <b>{t.flat}</b> · <span className="whitespace-nowrap">{formatPhone(t.phone)}</span>
                      </span>
                      <a
                        href={t.href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => markTapped(t.key)}
                        className={`whitespace-nowrap ${tapped.has(t.key) ? "text-slate-400" : "font-medium text-emerald-700 hover:underline"}`}
                      >
                        {tapped.has(t.key) ? "Opened ✓" : "Open WhatsApp"}
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-emerald-900/70">
                  Sending these from the committee&apos;s phone is free. To send them automatically instead, see “Resident WhatsApp” in Settings → System check.
                </p>
              </div>
            )}

            {problems.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-auto text-xs">
                {problems.map((r) => (
                  <li key={r.flatId} className={r.status === "failed" ? "text-rose-700" : "text-slate-600"}>
                    <b>{r.flat}</b>: {r.reason ?? r.status}
                  </li>
                ))}
              </ul>
            )}
            {preview && (
              <details className="text-xs">
                <summary className="cursor-pointer font-medium text-slate-700">Offline demo: no email is really sent. See what {preview.to} would receive</summary>
                <div className="mt-2 rounded-lg bg-slate-50 p-3">
                  <div className="font-semibold text-slate-800">{preview.subject}</div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700">{preview.text}</pre>
                </div>
              </details>
            )}
          </div>
        )}
        {withContacts.length > 0 && !importing && (
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer">Show saved contacts</summary>
            <ul className="mt-2 max-h-48 space-y-0.5 overflow-auto">
              {withContacts.map((f) => (
                <li key={f.id}>
                  <b>{flatLabelOf(f)}</b>: {[...listOf(f.residentEmails), ...listOf(f.residentPhones).map(formatPhone)].join(", ")}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}
