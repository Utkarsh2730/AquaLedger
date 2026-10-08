"use client";

import { useEffect, useState } from "react";
import { client, unwrap } from "@/lib/client";
import type { Schema } from "@/amplify/data/resource";
import { useSociety } from "@/components/SocietyContext";
import { Button, Card, ErrorBox, Field, Input, PageHeader, Spinner } from "@/components/ui";

type Society = Schema["Society"]["type"];

export default function SettingsPage() {
  const { societyId } = useSociety();
  const [society, setSociety] = useState<Society | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    client.models.Society.get({ societyId })
      .then((r) => setSociety(r.data))
      .catch(setError);
  }, [societyId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!society) return;
    const res = await client.models.Society.update({ societyId, name: society.name, city: society.city, commonCharge: society.commonCharge });
    if (res.errors?.length) setError(new Error(res.errors[0].message));
    else setMsg("Saved.");
  }

  async function rotateToken() {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
    const res = await client.models.Society.update({ societyId, deviceToken: token });
    if (res.data) setSociety(res.data);
    setMsg("Device token rotated. Update your simulator.");
  }

  async function resetDemo() {
    if (!confirm("Reset demo data? Readings, supplies and tankers are regenerated; alerts, bills and insights are deleted.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = unwrap<{ readings: number; leakFlat: string }>(await client.mutations.seedDemoData({ societyId }));
      setMsg(`Demo data reset: ${res.readings.toLocaleString("en-IN")} readings, planted leak in ${res.leakFlat}.`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!society) return error ? <ErrorBox error={error} /> : <Spinner />;
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" />
      <ErrorBox error={error} />
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}
      <Card title="Society">
        <form onSubmit={save} className="space-y-4">
          <Field label="Name">
            <Input value={society.name} onChange={(e) => setSociety({ ...society, name: e.target.value })} />
          </Field>
          <Field label="City">
            <Input value={society.city ?? ""} onChange={(e) => setSociety({ ...society, city: e.target.value })} />
          </Field>
          <Field label="Common-area charge per flat (₹/month)">
            <Input type="number" min={0} value={society.commonCharge ?? 0} onChange={(e) => setSociety({ ...society, commonCharge: Number(e.target.value) })} />
          </Field>
          <Button type="submit">Save</Button>
        </form>
      </Card>
      <Card title="Meter device token">
        <p className="mb-3 text-sm text-slate-600">Smart meters (and the simulator) send this in the <code>x-device-token</code> header.</p>
        <code className="block break-all rounded bg-slate-100 p-2 text-xs">{society.deviceToken}</code>
        <Button variant="secondary" className="mt-3" onClick={rotateToken}>
          Rotate token
        </Button>
      </Card>
      <Card title="Demo data">
        <p className="mb-3 text-sm text-slate-600">Run this right before you present so the demo starts from a known state.</p>
        <Button variant="danger" onClick={resetDemo} disabled={busy}>
          {busy ? "Resetting…" : "Reset demo data"}
        </Button>
      </Card>
      <Card title="Society ID">
        <code className="text-xs">{societyId}</code>
      </Card>
    </div>
  );
}
