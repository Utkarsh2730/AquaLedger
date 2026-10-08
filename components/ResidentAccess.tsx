"use client";

import { useEffect, useRef, useState } from "react";
import { client, DEMO, flatLabelOf, fmtDateTime, residentEmailEnabled, residentWhatsAppEnabled, unwrap, type FlatModel, type SendAccessResult } from "@/lib/client";
import { residentLink } from "@/lib/core/access";
import { formatPhone, parseEmailList, parsePhoneList, whatsappLink, whatsappText } from "@/lib/core/residents";
import { Button, ErrorBox } from "./ui";

const listOf = (v: (string | null)[] | null | undefined) => (v ?? []).filter(Boolean) as string[];

/**
 * Committee-side resident access for one flat: the residents' emails and mobiles, sending them
 * their login, or issuing a code to share by hand (shown once, only its hash is stored),
 * replacing it, or revoking it. Residents need no account.
 */
export default function ResidentAccess({ societyId, flat, onClose, onChanged }: { societyId: string; flat: FlatModel; onClose: () => void; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState<string | null>(null);
  const [societyName, setSocietyName] = useState("Your society");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const label = flatLabelOf(flat);
  const active = Boolean(flat.accessIssuedAt);
  const savedEmails = listOf(flat.residentEmails);
  const savedPhones = listOf(flat.residentPhones);
  const [emailText, setEmailText] = useState(savedEmails.join(", "));
  const [phoneText, setPhoneText] = useState(savedPhones.map(formatPhone).join(", "));
  const [contactMsg, setContactMsg] = useState<string | null>(null);
  const typedEmails = parseEmailList(emailText);
  const typedPhones = parsePhoneList(phoneText);
  const contactsChanged = typedEmails.emails.join(",") !== savedEmails.join(",") || typedPhones.phones.join(",") !== savedPhones.join(",");
  const autoEmails = residentEmailEnabled ? savedEmails.length : 0;
  const reachable = autoEmails + savedPhones.length;

  async function saveContacts() {
    const bad = [...typedEmails.bad, ...typedPhones.bad];
    if (bad.length) return setError(new Error(`Not a valid email or mobile number: ${bad.join(", ")}`));
    setBusy(true);
    setError(null);
    setContactMsg(null);
    try {
      unwrap(await client.models.Flat.update({ id: flat.id, residentEmails: typedEmails.emails, residentPhones: typedPhones.phones }));
      setEmailText(typedEmails.emails.join(", "));
      setPhoneText(typedPhones.phones.map(formatPhone).join(", "));
      setContactMsg("Contacts saved.");
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function sendLogin() {
    if ((active || code) && !confirm(`Send ${label} a new code? The current code stops working immediately.`)) return;
    setBusy(true);
    setError(null);
    setContactMsg(null);
    try {
      const res = unwrap<{ results: SendAccessResult[]; society?: string }>(
        await client.mutations.sendResidentAccess({ societyId, flatIds: [flat.id], origin: window.location.origin, replaceExisting: true })
      );
      const r = res.results[0];
      if (r.status !== "sent" && r.status !== "manual") throw new Error(r.reason ?? "Not sent");
      if (res.society) setSocietyName(res.society);
      // numbers to message from the committee's own WhatsApp come back with the code
      setCode(r.code ?? null);
      const parts = [
        r.sentTo.length > 0 && `${DEMO ? "Demo: would have sent" : "Sent"} the new code to ${r.sentTo.map((x) => (x.startsWith("+") ? formatPhone(x) : x)).join(", ")}.`,
        r.manualPhones?.length && `Now tap the WhatsApp button for each number above.`,
        r.reason,
      ];
      setContactMsg(parts.filter(Boolean).join(" "));
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function issue() {
    if (active && !code && !confirm(`Give ${label} a new code? The current code stops working immediately.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = unwrap<{ code: string; society?: string }>(await client.mutations.issueResidentAccess({ societyId, flatId: flat.id }));
      setCode(res.code);
      if (res.society) setSocietyName(res.society);
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm(`Revoke resident access for ${label}? Their code stops working immediately.`)) return;
    setBusy(true);
    setError(null);
    try {
      unwrap(await client.mutations.revokeResidentAccess({ societyId, flatId: flat.id }));
      setCode(null);
      onChanged();
      dialog.current?.close();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const link = code ? residentLink(window.location.origin, code) : "";
  const message = code ? whatsappText({ societyName, flat: label, code, link }) : "";
  const copy = async (what: string, text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-label={`Resident access for flat ${label}`}
      className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-2xl p-0 shadow-2xl backdrop:bg-slate-950/60"
    >
      <div className="border-b border-slate-100 bg-emerald-50 px-6 py-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Resident access</div>
        <div className="mt-0.5 text-lg font-semibold text-slate-900">Flat {label}</div>
      </div>
      <div className="space-y-4 px-6 py-5 text-sm">
        <ErrorBox error={error} />
        {code ? (
          <>
            <p className="text-slate-600">Send this to the residents of {label}. It&apos;s shown only now: AquaLedger stores just a scrambled copy.</p>
            <div className="rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-4 text-center">
              <div className="text-xs font-medium text-emerald-700">Access code</div>
              <div className="mt-1 select-all font-mono text-2xl font-semibold tracking-widest text-slate-900">{code}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="secondary" onClick={() => copy("link", link)}>{copied === "link" ? "Copied ✓" : "Copy link"}</Button>
              <Button variant="secondary" onClick={() => copy("code", code)}>{copied === "code" ? "Copied ✓" : "Copy code"}</Button>
              <a
                href={whatsappLink(null, message)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-emerald-600 px-3.5 py-2 font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Share on WhatsApp
              </a>
            </div>
            {savedPhones.length > 0 && (
              <div className="grid gap-2">
                {savedPhones.map((p) => (
                  <a
                    key={p}
                    href={whatsappLink(p, message)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-2 font-medium text-white hover:bg-emerald-700"
                  >
                    💬 WhatsApp {formatPhone(p)}
                  </a>
                ))}
              </div>
            )}
            <p className="break-all text-xs text-slate-500">{link}</p>
          </>
        ) : active ? (
          <p className="text-slate-600">
            Residents of {label} have had access since <b>{fmtDateTime(flat.accessIssuedAt!)}</b>. For security the code can&apos;t be shown again. If they&apos;ve lost it, or the
            flat has new residents, give a new code: the old one stops working at once.
          </p>
        ) : (
          <p className="text-slate-600">
            Give the residents of {label} a private code. With it they see this flat&apos;s water use, bills and leak alerts, and nothing else. No account or password needed.
          </p>
        )}
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <label className="block text-xs font-medium text-slate-700">
            Resident emails
            <input
              id="flat-emails"
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              placeholder="owner@example.com, tenant@example.com"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-brand-500"
            />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Resident mobiles (WhatsApp)
            <input
              id="flat-phones"
              value={phoneText}
              onChange={(e) => setPhoneText(e.target.value)}
              placeholder="98765 43210, 91234 56789"
              inputMode="tel"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-brand-500"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={saveContacts} disabled={busy || !contactsChanged}>
              Save contacts
            </Button>
            {reachable > 0 && (
              <Button onClick={sendLogin} disabled={busy || contactsChanged} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                Send {active || code ? "a new code" : "the login"} to {reachable === 1 ? "1 resident" : `${reachable} residents`}
              </Button>
            )}
          </div>
          {reachable > 0 && (
            <p className="text-xs text-slate-500">
              {[autoEmails > 0 && "by email", savedPhones.length > 0 && (residentWhatsAppEnabled ? "by WhatsApp" : "on WhatsApp from your phone (one tap each)")].filter(Boolean).join(" and ")}
            </p>
          )}
          {contactMsg && <p className="text-xs text-emerald-700">{contactMsg}</p>}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
          <div className="flex gap-2">
            <Button onClick={issue} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy ? "Working…" : active || code ? "Give a new code" : "Give access"}
            </Button>
            {(active || code) && (
              <Button variant="danger" onClick={revoke} disabled={busy}>
                Revoke
              </Button>
            )}
          </div>
          <Button variant="ghost" onClick={() => dialog.current?.close()}>
            Done
          </Button>
        </div>
      </div>
    </dialog>
  );
}
