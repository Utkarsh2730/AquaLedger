"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { client, DEMO, flatLabelOf, listAll, loadFlats, meterIngestUrl, postMeterReading, type AlertModel, type FlatModel } from "@/lib/client";
import { useSociety } from "@/components/SocietyContext";
import { Badge, Button, Card, ErrorBox, Field, PageHeader, Select } from "@/components/ui";
import { LiveChart } from "@/components/charts";

/**
 * Live leak demo. The "virtual meter" here posts a reading every 3 seconds to the same public
 * ingest URL the Python simulator uses (scripts/meter_simulator.py). Opening the tap pushes the
 * flow far above the flat's normal rate; the ingest Lambda raises an alert and emails it.
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
  const pyCmd = `python scripts/meter_simulator.py --url ${meterIngestUrl ?? "<meterIngestUrl>"} --society ${societyId} --token ${token ?? "<token>"} --flat ${flat ? flatLabelOf(flat) : "C-301"}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Live meters" subtitle="Simulated smart meter → Lambda Function URL → DynamoDB → alert + email, within seconds." />
      <ErrorBox error={error} />
      {!meterIngestUrl && <ErrorBox error="meterIngestUrl missing from amplify_outputs.json. Redeploy the backend." />}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Virtual meter" className="lg:col-span-1">
          <div className="space-y-4">
            <Field label="Flat">
              <Select value={flatId} onChange={(e) => setFlatId(e.target.value)} disabled={running}>
                {flats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {flatLabelOf(f)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button className="w-full" variant={running ? "secondary" : "primary"} onClick={() => setRunning(!running)} disabled={!token || !meterIngestUrl}>
              {running ? "■ Stop meter" : "▶ Start meter"}
            </Button>
            <Button className="w-full" variant={tapOpen ? "danger" : "secondary"} onClick={() => setTapOpen(!tapOpen)} disabled={!running}>
              {tapOpen ? "🚰 Close the tap" : "💦 Open the tap (simulate leak)"}
            </Button>
            <p className="text-xs text-slate-500">Sends one reading every 3 s. Normal use is ~0-1 L/min; an open tap is ~12 L/min.</p>
          </div>
        </Card>
        <Card title="Flow" className="lg:col-span-2" action={running && <Badge tone={tapOpen ? "bad" : "good"}>{tapOpen ? "abnormal" : "normal"}</Badge>}>
          <LiveChart data={ticks} />
        </Card>
      </div>
      <Card title="Alerts raised during this session">
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-500">None yet. Start the meter and open the tap.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                🚨 <b>{new Date(a.detectedAt).toLocaleTimeString("en-IN")}</b> · {a.message}
              </div>
            ))}
            <p className="text-xs text-slate-500">{DEMO ? "In the live app an email also goes to every confirmed admin." : "An email went to every confirmed admin subscription."}</p>
          </div>
        )}
      </Card>
      {!DEMO && (
      <Card title="Run the Python simulator instead (for the stage demo)">
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{pyCmd}</pre>
        <p className="mt-2 text-xs text-slate-500">Press Enter in the terminal to open/close the tap. Keep the device token secret; rotate it from Settings.</p>
      </Card>
      )}
    </div>
  );
}
