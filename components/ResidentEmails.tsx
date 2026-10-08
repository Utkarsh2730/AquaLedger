"use client";

import { useMemo, useRef, useState } from "react";
import { client, DEMO, flatLabelOf, residentEmailEnabled, unwrap, type EmailAccessResult, type FlatModel } from "@/lib/client";
import { EMAIL_BATCH, parseResidentEmails } from "@/lib/core/residents";
import { Button, Card, ErrorBox } from "./ui";

const EXAMPLE = `Flat, Email
A-101, rahul.sharma@gmail.com
A-101, priya.sharma@gmail.com
A-102, owner@example.com; tenant@example.com`;

type Preview = { to: string; subject: string; text: string };

/**
 * The committee pastes or uploads its resident register; AquaLedger then emails every listed flat
 * its login (flat number + access code). No resident signs up or sets a password.
 */
export default function ResidentEmails({ societyId, flats, onChanged }: { societyId: string; flats: FlatModel[]; onChanged: () => Promise<unknown> }) {
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [replace, setReplace] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<EmailAccessResult[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (text.trim() ? parseResidentEmails(text, flats) : null), [text, flats]);
  const emailsOf = (f: FlatModel) => (f.residentEmails ?? []).filter(Boolean) as string[];
  const withEmails = flats.filter((f) => emailsOf(f).length);
  const toSend = withEmails.filter((f) => replace || !f.accessIssuedAt);
  const notYet = withEmails.filter((f) => !f.accessIssuedAt).length;

  async function save() {
    if (!parsed?.byFlat.size) return;
    setError(null);
    setSavedMsg(null);
    const entries = [...parsed.byFlat.entries()];
    try {
      for (let i = 0; i < entries.length; i += 5) {
        setSaving(`Saving ${Math.min(i + 5, entries.length)} of ${entries.length}…`);
        await Promise.all(
          entries.slice(i, i + 5).map(async ([id, residentEmails]) => unwrap(await client.models.Flat.update({ id, residentEmails })))
        );
      }
      await onChanged();
      setSavedMsg(`Saved emails for ${entries.length} flat${entries.length === 1 ? "" : "s"}.`);
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
    if (!confirm(`Email logins to the residents of ${ids.length} flat${ids.length === 1 ? "" : "s"}?${warn}`)) return;
    setError(null);
    setResults([]);
    setPreview(null);
    setProgress({ done: 0, total: ids.length });
    const all: EmailAccessResult[] = [];
    try {
      for (let i = 0; i < ids.length; i += EMAIL_BATCH) {
        const res = unwrap<{ results: EmailAccessResult[]; preview?: Preview }>(
          await client.mutations.emailResidentAccess({ societyId, flatIds: ids.slice(i, i + EMAIL_BATCH), origin: window.location.origin, replaceExisting: replace })
        );
        all.push(...res.results);
        if (res.preview) setPreview((p) => p ?? res.preview!);
        setResults([...all]);
        setProgress({ done: Math.min(i + EMAIL_BATCH, ids.length), total: ids.length });
      }
    } catch (err) {
      setError(err);
    } finally {
      setProgress(null);
      await onChanged();
    }
  }

  const count = (s: EmailAccessResult["status"]) => results?.filter((r) => r.status === s) ?? [];
  const sentEmails = count("sent").reduce((n, r) => n + r.sentTo.length, 0);
  const problems = results?.filter((r) => r.status !== "sent" || r.reason) ?? [];

  return (
    <Card title="Email residents their login">
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          Add the resident emails you already have, and AquaLedger emails each flat its login: the <b>flat number</b> and a private <b>access code</b>. Residents don&apos;t sign up or
          set a password.
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-slate-700">
          <span>
            <b>{withEmails.length}</b> of {flats.length} flats have resident emails
          </span>
          <span>
            <b>{notYet}</b> of them haven&apos;t been sent a login yet
          </span>
        </div>
        <ErrorBox error={error} />
        {savedMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{savedMsg}</div>}

        {importing ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-slate-800">Paste your resident list, or upload it as a CSV</div>
              <div className="flex gap-2">
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
            </div>
            <textarea
              id="resident-emails"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={EXAMPLE}
              rows={7}
              className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <p className="text-xs text-slate-500">
              One row per resident or per flat: the flat (A-101, or block and number in two columns) and one or more emails. Other columns, like names, are ignored. Flats in the list
              get exactly these emails; flats not in it are left as they are.
            </p>
            {parsed && (
              <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs">
                <div className="text-slate-800">
                  Matched <b>{parsed.byFlat.size}</b> flats, <b>{[...parsed.byFlat.values()].reduce((n, l) => n + l.length, 0)}</b> emails.
                </div>
                {parsed.unknownFlats.length > 0 && <div className="text-amber-800">Not flats in this society (skipped): {parsed.unknownFlats.join(", ")}</div>}
                {parsed.badEmails.length > 0 && <div className="text-amber-800">Not valid emails (skipped): {parsed.badEmails.join(", ")}</div>}
                {parsed.truncated.length > 0 && <div className="text-amber-800">More than 6 emails, extra ones dropped: {parsed.truncated.join(", ")}</div>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={!parsed?.byFlat.size || Boolean(saving)}>
                {saving ?? `Save emails${parsed?.byFlat.size ? ` for ${parsed.byFlat.size} flats` : ""}`}
              </Button>
              <Button variant="ghost" onClick={() => setImporting(false)} disabled={Boolean(saving)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => (setImporting(true), setSavedMsg(null))}>
              Add resident emails
            </Button>
            <Button onClick={send} disabled={!residentEmailEnabled || !toSend.length || Boolean(progress)} className="bg-emerald-600 hover:bg-emerald-700">
              {progress ? `Sending… ${progress.done} of ${progress.total} flats` : `Email logins to ${toSend.length} flat${toSend.length === 1 ? "" : "s"}`}
            </Button>
            <label className="flex items-center gap-2 text-slate-600">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-4 w-4" />
              Also flats that already have access (gives them a new code)
            </label>
          </div>
        )}

        {!residentEmailEnabled && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            Email sending isn&apos;t switched on for this backend yet. Set <code>AQUALEDGER_SENDER_EMAIL</code> to your society&apos;s email address, redeploy, and click the link Amazon
            SES emails to it (Settings → System check walks you through it). Until then, use <b>Give access</b> below to share codes by link or WhatsApp.
          </p>
        )}

        {results && results.length > 0 && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-4">
            <div className="font-medium text-slate-800">
              {DEMO ? "Prepared" : "Sent"} {sentEmails} email{sentEmails === 1 ? "" : "s"} to {count("sent").length} flats
              {count("skipped").length > 0 && ` · skipped ${count("skipped").length}`}
              {count("failed").length > 0 && <span className="text-rose-700"> · {count("failed").length} failed</span>}
            </div>
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
              <details className="text-xs" open>
                <summary className="cursor-pointer font-medium text-slate-700">Offline demo: no email is really sent. This is what {preview.to} would receive</summary>
                <div className="mt-2 rounded-lg bg-slate-50 p-3">
                  <div className="font-semibold text-slate-800">{preview.subject}</div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700">{preview.text}</pre>
                </div>
              </details>
            )}
          </div>
        )}
        {withEmails.length > 0 && !importing && (
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer">Show saved emails</summary>
            <ul className="mt-2 max-h-48 space-y-0.5 overflow-auto">
              {withEmails.map((f) => (
                <li key={f.id}>
                  <b>{flatLabelOf(f)}</b>: {emailsOf(f).join(", ")}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}
