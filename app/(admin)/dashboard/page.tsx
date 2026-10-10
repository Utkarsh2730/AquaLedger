"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { client, fmtDateTime, inr, kl, unwrap } from "@/lib/client";
import { useSociety } from "@/components/SocietyContext";
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner, Stat, Table, Td } from "@/components/ui";
import { CostChart, DailyTrendChart, SourceMixChart } from "@/components/charts";
import { AlertIcon, ArrowRightIcon, BoltIcon, DropIcon, GaugeIcon, RupeeIcon, SparklesIcon } from "@/components/icons";
import type { DashboardSummary } from "@/lib/core/summary";
import { monthLabel } from "@/lib/core/time";

interface DashboardResponse {
  society: { name?: string; city?: string };
  dashboard: DashboardSummary;
  insight: { month: string; summaryText: string; generatedBy: string } | null;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : 0);

export default function DashboardPage() {
  const { societyId } = useSociety();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(unwrap<DashboardResponse>(await client.queries.getDashboard({ societyId })));
    } catch (err) {
      setError(err);
    }
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadDemo() {
    setRunning(true);
    setError(null);
    try {
      unwrap(await client.mutations.seedDemoData({ societyId }));
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setRunning(false);
    }
  }

  async function runAnalysis() {
    setRunning(true);
    try {
      unwrap(await client.mutations.runAnalysis({ societyId, task: "all" }));
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setRunning(false);
    }
  }

  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return <Spinner label="Crunching your water data…" />;
  const d = data.dashboard;
  const k = d.kpis;
  const prevMonths = d.monthly.filter((m) => m.month < d.currentMonth);
  const lastComplete = prevMonths[prevMonths.length - 1];
  const noData = k.flats === 0 || d.monthly.every((m) => m.consumedLitres === 0);

  if (noData) {
    return (
      <div className="mx-auto max-w-xl space-y-4 pt-8">
        <PageHeader title={data.society.name ?? "Dashboard"} subtitle={`${k.flats} flats · no meter readings yet`} />
        <ErrorBox error={error} />
        <Card>
          <p className="text-sm text-slate-600">
            Load 6 months of realistic demo data (readings with summer spikes, tanker deliveries and a hidden leak in flat B-202), or start adding real readings and
            supply entries.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={loadDemo} disabled={running}>
              {running ? "Loading demo data… (~20 s)" : "Load demo data"}
            </Button>
            <Link href="/readings" className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Add readings
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.society.name ?? "Dashboard"}
        subtitle={`${data.society.city ? data.society.city + " · " : ""}${k.flats} flats · as of ${fmtDateTime(d.asOf)}`}
        action={
          <Button onClick={runAnalysis} disabled={running} variant="secondary">
            <BoltIcon width={16} height={16} className="text-amber-500" />
            {running ? "Running…" : "Run analysis now"}
          </Button>
        }
      />
      <ErrorBox error={error} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={DropIcon} label={`Used in ${monthLabel(d.currentMonth)}`} value={kl(k.litresThisMonth)} hint={`${Math.round(k.avgLitresPerFlatPerDay)} L per flat per day`} />
        <Stat
          icon={RupeeIcon}
          iconTone="neutral"
          label={lastComplete ? `Cost in ${monthLabel(lastComplete.month)}` : "Cost last month"}
          value={inr(k.costLastMonth)}
          hint={`${inr(k.costThisMonth)} so far this month`}
        />
        <Stat icon={GaugeIcon} iconTone="warn" label="Avg cost per kL" value={inr(k.costPerKl)} hint="Across all sources" />
        <Stat
          icon={AlertIcon}
          iconTone={k.openAlerts ? "bad" : "good"}
          label="Open leak alerts"
          value={k.openAlerts}
          tone={k.openAlerts ? "bad" : "good"}
          hint={k.openAlerts ? <Link href="/alerts" className="font-medium hover:underline">Review alerts →</Link> : "All clear"}
        />
      </div>

      {d.impact.leaksCaught > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Leak detection impact · last 90 days</div>
            <div className="mt-1 text-lg font-semibold text-emerald-950">
              {d.impact.leaksCaught} leak{d.impact.leaksCaught > 1 ? "s" : ""} caught · {kl(d.impact.litresPerMonth)}/month of water · ≈ {inr(d.impact.rupeesPerMonth)}/month at tanker prices
            </div>
            <div className="mt-1 text-sm text-emerald-800">
              {d.impact.fixed} fixed, {d.impact.open} open. AquaLedger costs this society about {inr(k.flats * 12)}/month.
            </div>
          </div>
          {d.impact.open > 0 && (
            <Link href="/alerts" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
              Review open leaks →
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Where the water comes from (monthly)" className="lg:col-span-2">
          <SourceMixChart data={d.monthly} currentMonth={d.currentMonth} />
        </Card>
        <Card title="Cost per kL by source">
          <div className="space-y-3">
            {d.costPerKlBySource.map((s) => {
              const max = Math.max(...d.costPerKlBySource.map((x) => x.costPerKl), 1);
              return (
                <div key={s.source}>
                  <div className="flex justify-between text-sm">
                    <span>{s.source}</span>
                    <span className="font-semibold">{inr(s.costPerKl)}/kL</span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-slate-100">
                    <div className="h-2 rounded bg-brand-500" style={{ width: `${(s.costPerKl / max) * 100}%` }} />
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {kl(s.litres, 0)} · {inr(s.cost)}
                  </div>
                </div>
              );
            })}
            <p className="pt-2 text-xs text-slate-500">Every litre a leak wastes is ultimately bought at tanker prices.</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Spend by source" className="lg:col-span-2">
          <CostChart data={d.monthly} currentMonth={d.currentMonth} />
        </Card>
        <Card title={d.forecast ? `Forecast · ${monthLabel(d.forecast.month)}` : "Forecast"}>
          {d.forecast ? (
            (() => {
              const f = d.forecast;
              const own = f.municipalLitres + f.borewellLitres;
              const parts = [
                { label: "Municipal", litres: f.municipalLitres, color: "bg-cyan-600" },
                { label: "Borewell", litres: f.borewellLitres, color: "bg-lime-600" },
                { label: "Tankers", litres: Math.max(f.demandLitres - own, 0), color: "bg-amber-500" },
              ];
              const total = Math.max(f.demandLitres, own, 1);
              return (
                <div className="flex flex-col gap-4 text-sm">
                  <div>
                    <div className="text-4xl font-semibold tracking-tight">
                      {f.tankers} <span className="text-lg font-medium text-slate-500">tankers</span>
                    </div>
                    <div className="mt-1 text-slate-500">
                      ≈ {inr(f.tankerCost)} · demand {kl(f.demandLitres)}
                    </div>
                  </div>
                  <div>
                    <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-label="Where next month's water comes from">
                      {parts.map((p) => (
                        <div key={p.label} className={p.color} style={{ width: `${(p.litres / total) * 100}%` }} />
                      ))}
                    </div>
                    <ul className="mt-3 space-y-1.5 text-xs">
                      {parts.map((p) => (
                        <li key={p.label} className="flex items-center justify-between gap-2 text-slate-600">
                          <span className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${p.color}`} />
                            {p.label}
                          </span>
                          <span className="font-medium text-slate-800">{kl(p.litres)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-xs text-slate-500">Seasonal factor ×{f.seasonalFactor}. Book tankers before the rush.</p>
                  <Link href="/insights" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
                    Plan tankers <ArrowRightIcon width={16} height={16} />
                  </Link>
                </div>
              );
            })()
          ) : (
            <p className="text-sm text-slate-500">Needs at least one complete month of readings.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Top 10 flats · last 30 days" className="lg:col-span-1">
          <Table head={["Flat", "Used", "vs avg"]}>
            {d.topFlats.map((f) => (
              <tr key={f.flatId}>
                <Td>
                  <Link className="font-medium text-brand-700 hover:underline" href={`/flats/detail?id=${encodeURIComponent(f.flatId)}`}>
                    {f.flatLabel}
                  </Link>
                </Td>
                <Td>{kl(f.litres)}</Td>
                <Td>{f.vsAverage >= 1.5 ? <Badge tone="bad">{f.vsAverage}×</Badge> : <span>{f.vsAverage}×</span>}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Daily consumption · last 45 days" className="lg:col-span-2">
          <DailyTrendChart data={d.dailyTrend} height={420} />
        </Card>
      </div>

      <Card
        title={
          <span className="flex items-center gap-2">
            <SparklesIcon width={18} height={18} className="text-brand-600" /> Monthly insight
          </span>
        } action={data.insight && <Badge tone="info">auto summary</Badge>}>
        {data.insight ? (
          <p className="text-sm leading-relaxed text-slate-700">{data.insight.summaryText}</p>
        ) : (
          <p className="text-sm text-slate-500">
            No insight yet. Click <b>Run analysis now</b> to scan for leaks, bill last month and write the summary.
          </p>
        )}
        {lastComplete && prevMonths.length > 1 && (
          <p className="mt-3 text-xs text-slate-500">
            {(() => {
              const p = pct(lastComplete.consumedLitres, prevMonths[prevMonths.length - 2].consumedLitres);
              return p === 0 ? `${monthLabel(lastComplete.month)} use was about the same as the month before.` : `${monthLabel(lastComplete.month)} use was ${p > 0 ? "+" : ""}${p}% vs the month before.`;
            })()}
          </p>
        )}
      </Card>
    </div>
  );
}
