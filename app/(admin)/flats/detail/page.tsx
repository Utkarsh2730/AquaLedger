"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { client, fmtDate, unwrap } from "@/lib/client";
import { useSociety } from "@/components/SocietyContext";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import FlatUsage from "@/components/FlatUsage";
import type { FlatDetail } from "@/lib/core/summary";
import type { BillRec } from "@/lib/core/types";

function Detail() {
  const { societyId } = useSociety();
  const flatId = useSearchParams().get("id") ?? "";
  const [data, setData] = useState<(FlatDetail & { bills: BillRec[] }) | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    client.queries
      .getFlatDetail({ societyId, flatId })
      .then((r) => setData(unwrap(r)))
      .catch(setError);
  }, [societyId, flatId]);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  return (
    <div>
      <Link href="/flats" className="text-sm text-brand-700 hover:underline">
        ← All flats
      </Link>
      <PageHeader title={`Flat ${data.flat.label}`} subtitle={`${data.flat.occupants ?? "?"} occupants · ${data.flat.accessIssuedAt ? "resident access active since " + fmtDate(data.flat.accessIssuedAt.slice(0, 10)) : "no resident access yet (give it from Flats)"}`} />
      <FlatUsage detail={data} bills={data.bills} billHref={(b) => `/bills/view?id=${encodeURIComponent(b.id)}`} />
    </div>
  );
}

export default function FlatDetailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Detail />
    </Suspense>
  );
}
