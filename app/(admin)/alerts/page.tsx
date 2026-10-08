"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { client, fmtDateTime, listAll, unwrap, type AlertModel } from "@/lib/client";
import { useSociety } from "@/components/SocietyContext";
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { AlertIcon, CheckIcon, MoonIcon, SearchIcon } from "@/components/icons";

const TYPE_LABEL: Record<string, string> = { spike: "Usage spike", night_flow: "Night flow (2-4 a.m.)", live_spike: "Live abnormal flow" };

export default function AlertsPage() {
  const { societyId } = useSociety();
  const [alerts, setAlerts] = useState<AlertModel[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAlerts(await listAll<AlertModel>((nextToken) => client.models.Alert.listAlertsBySociety({ societyId }, { sortDirection: "DESC", limit: 200, nextToken }), 400));
    } catch (err) {
      setError(err);
    }
  }, [societyId]);
  useEffect(() => {
    load();
  }, [load]);

  async function scan() {
    setScanning(true);
    setError(null);
    try {
      const res = unwrap<{ leaks: { findings: number; newAlerts: number } }>(await client.mutations.runAnalysis({ societyId, task: "leaks" }));
      setScanMsg(`Scan complete: ${res.leaks.findings} suspicious pattern(s), ${res.leaks.newAlerts} new alert(s).`);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setScanning(false);
    }
  }

  async function resolve(a: AlertModel) {
    await client.models.Alert.update({ id: a.id, resolved: !a.resolved });
    load();
  }

  if (!alerts) return error ? <ErrorBox error={error} /> : <Spinner />;
  const shown = alerts.filter((a) => showResolved || !a.resolved);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Leak alerts"
        subtitle="Every night each flat is checked for unusual spikes in usage and for water running between 2 and 4 a.m. Smart meters raise alerts within seconds."
        action={
          <Button onClick={scan} disabled={scanning}>
            <SearchIcon width={16} height={16} />
            {scanning ? "Scanning…" : "Scan for leaks now"}
          </Button>
        }
      />
      <ErrorBox error={error} />
      {scanMsg && <div className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900">{scanMsg}</div>}
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved
      </label>
      {shown.length === 0 ? (
        <Empty>
          <CheckIcon className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
          No {showResolved ? "" : "open "}alerts. Every flat looks normal.
        </Empty>
      ) : (
        <div className="space-y-3">
          {shown.map((a) => (
            <Card
              key={a.id}
              className={`border-l-4 ${a.resolved ? "border-l-emerald-400 opacity-60" : a.severity === "high" ? "border-l-rose-500" : a.severity === "medium" ? "border-l-amber-400" : "border-l-slate-300"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${a.resolved ? "bg-emerald-50 text-emerald-600" : a.severity === "high" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}
                >
                  {a.resolved ? <CheckIcon /> : a.type === "night_flow" ? <MoonIcon /> : <AlertIcon />}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/flats/detail?id=${encodeURIComponent(a.flatId)}`} className="font-semibold text-brand-700 hover:underline">
                      {a.flatLabel}
                    </Link>
                    <Badge tone={a.severity === "high" ? "bad" : a.severity === "medium" ? "warn" : "neutral"}>{a.severity}</Badge>
                    <Badge tone="info">{TYPE_LABEL[a.type ?? ""] ?? a.type}</Badge>
                    {a.resolved && <Badge tone="good">resolved</Badge>}
                  </div>
                  <p className="text-sm text-slate-700">{a.message}</p>
                  <p className="text-xs text-slate-400">{fmtDateTime(a.detectedAt)}</p>
                </div>
                <Button variant={a.resolved ? "ghost" : "secondary"} onClick={() => resolve(a)}>
                  {!a.resolved && <CheckIcon width={16} height={16} />}
                  {a.resolved ? "Reopen" : "Mark fixed"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
