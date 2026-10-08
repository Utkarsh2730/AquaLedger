"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { DemoBanner } from "@/components/Auth";
import AuthLayout from "@/components/AuthLayout";
import BackendGate from "@/components/BackendGate";
import BackLink from "@/components/BackLink";
import { LogoutIcon } from "@/components/icons";
import { client, DEMO, inr, unwrap } from "@/lib/client";
import { Button, Card, ErrorBox, Spinner } from "@/components/ui";
import FlatUsage from "@/components/FlatUsage";
import type { FlatDetail } from "@/lib/core/summary";
import type { BillRec } from "@/lib/core/types";
import { monthLabel } from "@/lib/core/time";
import { formatAccessCode, isWellFormedAccessCode } from "@/lib/core/access";
import { DEMO_RESIDENT_CODE } from "@/lib/demo/backend";

type Portal = Omit<FlatDetail, "flat"> & { society: { name?: string; city?: string }; flat: { label: string }; bills: BillRec[] };

const STORAGE_KEY = "aqualedger-resident-code";
const readSaved = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const writeSaved = (code: string | null) => {
  try {
    if (code) localStorage.setItem(STORAGE_KEY, code);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private window or blocked storage: the code just isn't remembered
  }
};

/** Residents have no account; a signed-in committee member on the same browser still uses their own login. */
async function fetchPortal(code: string): Promise<Portal> {
  const authMode = DEMO ? undefined : await fetchAuthSession().then((s) => (s.tokens ? "userPool" : "identityPool")).catch(() => "identityPool" as const);
  return unwrap<Portal>(await client.queries.residentPortal({ code }, authMode ? { authMode } : undefined));
}

function CodeForm({ initial, busy, error, onSubmit }: { initial: string; busy: boolean; error: unknown; onSubmit: (code: string, remember: boolean) => void }) {
  const [code, setCode] = useState(initial);
  const [remember, setRemember] = useState(true);
  const wellFormed = isWellFormedAccessCode(code);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (wellFormed) onSubmit(code, remember);
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Flat access code</span>
        <input
          id="access-code"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="K7M2-QX9P-4HDR"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center font-mono text-xl tracking-[0.2em] uppercase outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
        Remember on this device
      </label>
      <ErrorBox error={error} />
      <button
        type="submit"
        disabled={!wellFormed || busy}
        className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Opening…" : "Open my flat"}
      </button>
      <p className="text-xs text-slate-500">
        One code per flat, shared by everyone living there. Lost it? Ask your society committee: they can issue a new one, which also switches off the old one.
      </p>
      {DEMO && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Offline demo: flat B-202 has the code <b className="font-mono">{DEMO_RESIDENT_CODE}</b>. Committee → Flats → Give access makes codes for the others.
        </p>
      )}
    </form>
  );
}

function PortalView({ data, onLeave }: { data: Portal; onLeave: () => void }) {
  const [bill, setBill] = useState<BillRec | null>(null);
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <BackLink fallback="/" fallbackLabel="Back to home" remember={false} className="mb-2" />
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-emerald-700">💧 AquaLedger · Resident</div>
          <div className="text-sm text-slate-500">
            {data.society.name} · Flat {data.flat.label}
          </div>
        </div>
        <button
          onClick={onLeave}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm! font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          title="Close this flat on this device"
        >
          <LogoutIcon width={16} height={16} />
          Close flat
        </button>
      </header>
      <FlatUsage detail={data} bills={data.bills} />
      {data.bills.length > 0 && (
        <Card title="Bill details" className="mt-6">
          <div className="flex flex-wrap gap-2">
            {data.bills.map((b) => (
              <button key={b.id} onClick={() => setBill(b)} className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50">
                {monthLabel(b.month)} · {inr(b.amount)}
              </button>
            ))}
          </div>
          {bill && (
            <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
              You used <b>{Math.round(bill.litres).toLocaleString("en-IN")} L</b> in {monthLabel(bill.month)}, <b>{bill.sharePct.toFixed(2)}%</b> of the society’s metered water. The
              society spent {inr(bill.totalWaterCost)} on water, so your usage charge is {inr(bill.usageCharge)}, plus {inr(bill.commonCharge)} common-area charge ={" "}
              <b>{inr(bill.amount)}</b>.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Resident() {
  const [initial, setInitial] = useState<string | null>(null);
  const [data, setData] = useState<Portal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [booting, setBooting] = useState(true);

  const open = useCallback(async (code: string, remember: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const portal = await fetchPortal(code);
      writeSaved(remember ? formatAccessCode(code) : null);
      setData(portal);
    } catch (err) {
      if (readSaved() === formatAccessCode(code)) writeSaved(null); // a replaced code shouldn't keep failing on every visit
      setError(err);
    } finally {
      setBusy(false);
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromLink = params.get("code");
    if (fromLink) {
      // keep the code out of the address bar (and browser history) once it's been read
      window.history.replaceState(null, "", window.location.pathname);
    }
    const code = fromLink ?? readSaved() ?? "";
    setInitial(code ? formatAccessCode(code) : "");
    if (code && isWellFormedAccessCode(code)) open(code, true);
    else setBooting(false);
  }, [open]);

  if (data)
    return (
      <PortalView
        data={data}
        onLeave={() => {
          writeSaved(null);
          setData(null);
          setInitial("");
        }}
      />
    );
  if (initial === null || booting) return <Spinner label="Opening your flat…" />;
  return (
    <AuthLayout role="resident">
      <CodeForm initial={initial} busy={busy} error={error} onSubmit={open} />
    </AuthLayout>
  );
}

export default function ResidentPage() {
  return (
    <BackendGate>
      <DemoBanner />
      <Resident />
    </BackendGate>
  );
}
