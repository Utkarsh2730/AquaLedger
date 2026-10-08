"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { client, inr, kl, listAll, unwrap, type BillModel } from "@/lib/client";
import { addMonths, monthLabel } from "@/lib/core/time";
import { equalSplit } from "@/lib/core/billing";
import { useSociety } from "@/components/SocietyContext";
import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, Stat, Table, Td } from "@/components/ui";
import { DownloadIcon } from "@/components/icons";

const thisMonth = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);

export default function BillsPage() {
  const { societyId } = useSociety();
  const [month, setMonth] = useState(addMonths(thisMonth(), -1));
  const [bills, setBills] = useState<BillModel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const b = await listAll<BillModel>((nextToken) => client.models.Bill.listBillsBySociety({ societyId, month: { eq: month } }, { limit: 500, nextToken }));
      setBills(b.sort((x, y) => (y.amount ?? 0) - (x.amount ?? 0)));
    } catch (err) {
      setError(err);
    }
  }, [societyId, month]);
  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      unwrap(await client.mutations.runAnalysis({ societyId, task: "billing", month }));
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function issueAll() {
    if (!bills) return;
    setBusy(true);
    await Promise.all(bills.filter((b) => b.status === "draft").map((b) => client.models.Bill.update({ id: b.id, status: "issued" })));
    await load();
    setBusy(false);
  }

  function exportCsv() {
    if (!bills?.length) return;
    const rows = [
      ["Flat", "Month", "Litres", "Share %", "Usage charge", "Common charge", "Amount", "Status"],
      ...[...bills]
        .sort((a, b) => (a.flatLabel ?? "").localeCompare(b.flatLabel ?? "", "en", { numeric: true }))
        .map((b) => [b.flatLabel, b.month, Math.round(b.litres ?? 0), (b.sharePct ?? 0).toFixed(3), b.usageCharge, b.commonCharge, b.amount, b.status]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `aqualedger-bills-${month}.csv` });
    link.click();
    URL.revokeObjectURL(url);
  }

  async function markPaid(b: BillModel) {
    await client.models.Bill.update({ id: b.id, status: b.status === "paid" ? "issued" : "paid" });
    load();
  }

  const total = bills?.reduce((a, b) => a + (b.amount ?? 0), 0) ?? 0;
  const waterCost = bills?.[0]?.totalWaterCost ?? 0;
  const common = bills?.[0]?.commonCharge ?? 0;
  const equal = bills?.length ? equalSplit(waterCost, bills.length, common) : 0;
  const overpaying = bills?.filter((b) => (b.amount ?? 0) < equal).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage-based bills"
        subtitle="Each flat pays its share of metered litres × total water cost, plus a fixed common-area charge."
        action={
          <div className="flex gap-2">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
            <Button onClick={generate} disabled={busy}>
              {busy ? "Working…" : bills?.length ? "Regenerate" : "Generate bills"}
            </Button>
          </div>
        }
      />
      <ErrorBox error={error} />
      {bills && bills.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label={`Water cost · ${monthLabel(month)}`} value={inr(waterCost)} />
          <Stat label="Total billed" value={inr(total)} hint={`incl. ${inr(common)} common charge × ${bills.length}`} />
          <Stat label="Old equal split" value={inr(equal)} hint="what every flat paid before" />
          <Stat label="Flats paying less now" value={`${overpaying} / ${bills.length}`} tone="good" hint="were subsidising heavy users" />
        </div>
      )}
      <Card
        title={`Bills for ${monthLabel(month)}`}
        action={
          bills && bills.length > 0 && (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={exportCsv}>
                <DownloadIcon width={16} height={16} /> Export CSV
              </Button>
              {bills.some((b) => b.status === "draft") && (
                <Button variant="secondary" onClick={issueAll} disabled={busy}>
                  Issue all drafts
                </Button>
              )}
            </div>
          )
        }
      >
        {!bills ? null : bills.length === 0 ? (
          <Empty>No bills for this month yet. Click “Generate bills”.</Empty>
        ) : (
          <Table head={["Flat", "Used", "Share", "Usage charge", "Total", "vs equal split", "Status", ""]}>
            {bills.map((b) => {
              const diff = (b.amount ?? 0) - equal;
              return (
                <tr key={b.id}>
                  <Td>
                    <Link href={`/bills/view?id=${encodeURIComponent(b.id)}`} className="font-medium text-brand-700 hover:underline">
                      {b.flatLabel}
                    </Link>
                  </Td>
                  <Td>{kl(b.litres)}</Td>
                  <Td>{(b.sharePct ?? 0).toFixed(2)}%</Td>
                  <Td>{inr(b.usageCharge)}</Td>
                  <Td className="font-semibold">{inr(b.amount)}</Td>
                  <Td className={diff > 0 ? "text-rose-600" : "text-emerald-600"}>
                    {diff > 0 ? "+" : "−"}
                    {inr(Math.abs(diff))}
                  </Td>
                  <Td>
                    <Badge tone={b.status === "paid" ? "good" : b.status === "issued" ? "info" : "neutral"}>{b.status}</Badge>
                  </Td>
                  <Td>
                    {b.status !== "draft" && (
                      <button className="text-xs text-brand-700 hover:underline" onClick={() => markPaid(b)}>
                        {b.status === "paid" ? "mark unpaid" : "mark paid"}
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
