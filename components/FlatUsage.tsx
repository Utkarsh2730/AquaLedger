"use client";

import Link from "next/link";
import { Badge, Card, Empty, Stat, Table, Td } from "./ui";
import { FlatVsAverageChart } from "./charts";
import { inr, kl } from "@/lib/client";
import { localMonth, monthLabel } from "@/lib/core/time";

const ALERT_LABEL: Record<string, string> = { spike: "Usage spike", night_flow: "Night-time flow", live_spike: "Live abnormal flow" };
import type { FlatDetail } from "@/lib/core/summary";
import type { BillRec } from "@/lib/core/types";

/** Shared by the admin flat drill-down and the resident portal. */
export default function FlatUsage({ detail, bills, billHref }: { detail: Omit<FlatDetail, "flat">; bills: BillRec[]; billHref?: (b: BillRec) => string }) {
  const last30 = detail.daily.slice(-31, -1);
  const mine = last30.reduce((a, d) => a + d.litres, 0);
  const avg = last30.reduce((a, d) => a + d.buildingAvg, 0);
  const ratio = avg > 0 ? mine / avg : 0;
  const open = detail.alerts.filter((a) => !a.resolved);
  const currentMonth = localMonth(new Date());
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Last 30 days" value={kl(mine)} hint={`${Math.round(mine / 30)} L/day`} />
        <Stat label="Building average" value={kl(avg)} hint="per flat, same period" />
        <Stat label="vs average" value={`${ratio.toFixed(2)}×`} tone={ratio > 1.3 ? "bad" : "good"} hint={ratio > 1.3 ? "Above average" : "Within normal range"} />
        <Stat label="Open alerts" value={open.length} tone={open.length ? "bad" : "good"} hint={open.length ? ALERT_LABEL[open[0].type] ?? "Possible leak" : "No leaks detected"} />
      </div>
      {open.length > 0 && (
        <div className="space-y-2">
          {open.map((a) => (
            <div key={a.id} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              🚨 {a.message}
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Daily use vs building average · 60 days">
          <FlatVsAverageChart data={detail.daily} xKey="day" xFormat={(d) => d.slice(5)} />
        </Card>
        <Card title="Monthly use vs building average">
          <FlatVsAverageChart data={detail.monthly} xKey="month" xFormat={(m) => (m === currentMonth ? `${monthLabel(m)} (so far)` : monthLabel(m))} />
        </Card>
      </div>
      <Card title="Bills">
        {bills.length === 0 ? (
          <Empty>No bills yet.</Empty>
        ) : (
          <Table head={["Month", "Used", "Share", "Amount", "Status"]}>
            {bills.map((b) => (
              <tr key={b.id}>
                <Td>{billHref ? <Link href={billHref(b)} className="font-medium text-brand-700 hover:underline">{monthLabel(b.month)}</Link> : monthLabel(b.month)}</Td>
                <Td>{kl(b.litres)}</Td>
                <Td>{b.sharePct.toFixed(2)}%</Td>
                <Td className="font-semibold">{inr(b.amount)}</Td>
                <Td>
                  <Badge tone={b.status === "paid" ? "good" : b.status === "issued" ? "info" : "neutral"}>{b.status}</Badge>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
