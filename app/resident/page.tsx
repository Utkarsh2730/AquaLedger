"use client";

import { useEffect, useState } from "react";
import { AuthGate, DemoBanner, useSession } from "@/components/Auth";
import { client, inr, unwrap } from "@/lib/client";
import { ErrorBox, Spinner, Card } from "@/components/ui";
import FlatUsage from "@/components/FlatUsage";
import type { FlatDetail } from "@/lib/core/summary";
import type { BillRec } from "@/lib/core/types";
import { monthLabel } from "@/lib/core/time";

type Portal =
  | { email: string; flat: null }
  | (Omit<FlatDetail, "flat"> & { email: string; society: { name?: string; city?: string }; flat: { label: string }; bills: BillRec[] });

function Portal() {
  const { signOut } = useSession();
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [bill, setBill] = useState<BillRec | null>(null);

  useEffect(() => {
    client.queries
      .myResidentPortal()
      .then((r) => setData(unwrap<Portal>(r)))
      .catch(setError);
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-brand-700">💧 AquaLedger · Resident</div>
          {data?.flat && "society" in data && (
            <div className="text-sm text-slate-500">
              {data.society.name} · Flat {data.flat.label}
            </div>
          )}
        </div>
        <button onClick={signOut} className="text-sm text-slate-600 hover:underline">
          Sign out
        </button>
      </header>
      <ErrorBox error={error} />
      {!data && !error && <Spinner />}
      {data && !data.flat && (
        <Card>
          <p className="text-sm text-slate-600">
            Your account ({data.email}) is not linked to a flat yet. Ask your society committee to invite this email from AquaLedger → Flats.
          </p>
        </Card>
      )}
      {data?.flat && "daily" in data && (
        <>
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
                  You used <b>{Math.round(bill.litres).toLocaleString("en-IN")} L</b> in {monthLabel(bill.month)}, <b>{bill.sharePct.toFixed(2)}%</b> of the society’s metered water.
                  The society spent {inr(bill.totalWaterCost)} on water, so your usage charge is {inr(bill.usageCharge)}, plus {inr(bill.commonCharge)} common-area charge ={" "}
                  <b>{inr(bill.amount)}</b>.
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function ResidentPage() {
  return (
    <AuthGate hideSignUp>
      <DemoBanner />
      <Portal />
    </AuthGate>
  );
}
