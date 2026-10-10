"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { client, DEMO, flatLabelOf, listAll, loadFlats, meterIngestUrl, postMeterReading, type AlertModel, type FlatModel } from "@/lib/client";
import { useSociety } from "@/components/SocietyContext";
import { Badge, Button, Card, ErrorBox, Field, PageHeader, Select } from "@/components/ui";
import { LiveChart } from "@/components/charts";

/** Copy-to-clipboard value row for the meter connection details. */
function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <code className="min-w-0 break-all rounded-lg bg-slate-100 px-2.5 py-2 text-xs text-slate-800">{shown ? value : "•".repeat(24)}</code>
      <div className="flex gap-1.5">
        {secret && (
          <Button variant="ghost" className="px-2.5 py-1.5 text-xs!" onClick={() => setShown(!shown)}>
            {shown ? "Hide" : "Show"}
          </Button>
        )}
        <Button
          variant="secondary"
          className="px-2.5 py-1.5 text-xs!"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Live meters. Real meters POST readings to the public ingest URL with the society's device token;
 * the ingest Lambda raises an alert and emails it when the flow is abnormal. "Test a meter" sends
 * readings from this browser through that same endpoint, so the committee can check the whole chain.
 */
export default function LivePage() {
  const { societyId } = useSociety();
  const [flats, setFlats] = useState<FlatModel[]>([]);
  const [flatId, setFlatId] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [tapOpen, setTapOpen] = useState(false);
  const [ticks, setTicks] = useState<{ t: string; litres: number }[]>([]);
  const [alerts, setAlerts] = useState<AlertModel[]>([]);
  const [error, setError] = useState<unknown>(null);
  const tapRef = useRef(tapOpen);
  tapRef.current = tapOpen;
  const startedAt = useRef(new Date().toISOString());

  useEffect(() => {
    loadFlats(societyId)
      .then((f) => {
        setFlats(f);
        setFlatId(f.find((x) => flatLabelOf(x) === "C-301")?.id ?? f[0]?.id ?? "");
      })
      .catch(setError);
    client.models.Society.get({ societyId }).then((s) => setToken(s.data?.deviceToken ?? null));
  }, [societyId]);

  const pollAlerts = useCallback(async () => {
    const all = await listAll<AlertModel>((nextToken) =>
      client.models.Alert.listAlertsBySociety({ societyId, detectedAt: { ge: startedAt.current } }, { sortDirection: "DESC", limit: 20, nextToken }), 20
    );
    setAlerts(all);
  }, [societyId]);

  useEffect(() => {
    if (!running || !token || !meterIngestUrl) return;
    const flat = flats.find((f) => f.id === flatId);
    if (!flat) return;
    const tick = async () => {
      // normal: ~0-1 L/min of intermittent use; open tap: ~12 L/min continuous
      const litres = tapRef.current ? 11 + Math.random() * 2 : Math.random() < 0.6 ? 0 : Math.random() * 1.2;
      setTicks((t) => [...t.slice(-39), { t: new Date().toLocaleTimeString("en-IN"), litres }]);
      try {
        const res = await postMeterReading({ societyId, flat: flatLabelOf(flat), litres, periodMinutes: 1 }, token);
        if (res.status !== 200) throw new Error(`Ingest failed: ${res.status} ${JSON.stringify(res.body)}`);
        await pollAlerts();
      } catch (err) {
        setError(err);
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [running, token, flatId, flats, societyId, pollAlerts]);

  const flat = flats.find((f) => f.id === flatId);
  const sampleBody = JSON.stringify({ societyId, flat: flat ? flatLabelOf(flat) : "C-301", litres: 12.5, periodMinutes: 1 });

  return (
    <div className="space-y-6">
      <PageHeader title="Live meters" subtitle="Smart meters send a reading every few seconds. Abnormal flow raises an alert and emails the committee straight away." />
      <ErrorBox error={error} />
      {!meterIngestUrl && <ErrorBox error="The meter endpoint is missing from this deployment. Redeploy the backend." />}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Test a meter" className="lg:col-span-1">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Sends readings from this browser through the same endpoint your meters use, so you can check that leak alerts reach the committee.</p>
            <Field label="Flat">
              <Select value={flatId} onChange={(e) => setFlatId(e.target.value)} disabled={running}>
                {flats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {flatLabelOf(f)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button className="w-full" variant={running ? "secondary" : "primary"} onClick={() => { setRunning(!running); if (running) setTapOpen(false); }} disabled={!token || !meterIngestUrl}>
              {running ? "■ Stop test" : "▶ Start test readings"}
            </Button>
            <Button className="w-full" variant={tapOpen ? "danger" : "secondary"} onClick={() => setTapOpen(!tapOpen)} disabled={!running}>
              {tapOpen ? "Stop the leak" : "Simulate a leak"}
            </Button>
            <p className="text-xs text-slate-500">One reading every 3 s: normal use is ~0-1 L/min, a leak ~12 L/min. Test readings are saved to the flat like real ones.</p>
          </div>
        </Card>
        <Card title="Flow" className="lg:col-span-2" action={running && <Badge tone={tapOpen ? "bad" : "good"}>{tapOpen ? "abnormal" : "normal"}</Badge>}>
          {ticks.length ? (
            <LiveChart data={ticks} />
          ) : (
            <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-300 px-4 text-center text-sm text-slate-500">
              Start a test to see the live flow here.
            </div>
          )}
        </Card>
      </div>
      <Card title="Alerts raised since you opened this page">
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-500">None yet.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                <b>{new Date(a.detectedAt).toLocaleTimeString("en-IN")}</b> · {a.message}
              </div>
            ))}
            <p className="text-xs text-slate-500">{DEMO ? "In the live app an email also goes to every confirmed admin." : "An email went to every confirmed admin subscription."}</p>
          </div>
        )}
      </Card>
      {!DEMO && meterIngestUrl && (
        <Card title="Connect your smart meters">
          <p className="mb-4 text-sm text-slate-600">Each meter, or the gateway it reports to, sends an HTTPS POST with its reading. Anything that can make a web request works.</p>
          <div className="space-y-2.5">
            <CopyRow label="Endpoint" value={meterIngestUrl} />
            <CopyRow label="Society ID" value={societyId} />
            {token && <CopyRow label="Device token" value={token} secret />}
          </div>
          <details className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">Request format</summary>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">{`POST ${meterIngestUrl}
content-type: application/json
x-device-token: <device token>

${sampleBody}`}</pre>
            <p className="mt-2 text-xs text-slate-500">
              <code>litres</code> is the water used over the last <code>periodMinutes</code>. A wrong token gets HTTP 401 and nothing is saved.
            </p>
          </details>
          <p className="mt-3 text-xs text-slate-500">
            Keep the device token secret. If it leaks, rotate it in{" "}
            <Link href="/settings" className="font-medium text-brand-700 underline underline-offset-2">
              Settings
            </Link>{" "}
            and update your meters.
          </p>
        </Card>
      )}
    </div>
  );
}
