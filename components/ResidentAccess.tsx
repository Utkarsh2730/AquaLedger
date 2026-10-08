"use client";

import { useEffect, useRef, useState } from "react";
import { client, flatLabelOf, fmtDateTime, unwrap, type FlatModel } from "@/lib/client";
import { residentLink } from "@/lib/core/access";
import { Button, ErrorBox } from "./ui";

/**
 * Committee-side resident access for one flat: issue a code (shown once, only its hash is stored),
 * share it, replace it, or revoke it. Residents need no account.
 */
export default function ResidentAccess({ societyId, flat, onClose, onChanged }: { societyId: string; flat: FlatModel; onClose: () => void; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const label = flatLabelOf(flat);
  const active = Boolean(flat.accessIssuedAt);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function issue() {
    if (active && !code && !confirm(`Give ${label} a new code? The current code stops working immediately.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = unwrap<{ code: string }>(await client.mutations.issueResidentAccess({ societyId, flatId: flat.id }));
      setCode(res.code);
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
  const message = code ? `Your AquaLedger access for flat ${label}: ${link}\n(or open ${window.location.origin}/resident and enter code ${code})` : "";
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
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-emerald-600 px-3.5 py-2 font-medium text-white hover:bg-emerald-700"
              >
                Share on WhatsApp
              </a>
            </div>
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
