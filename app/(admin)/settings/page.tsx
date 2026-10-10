"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { client, unwrap } from "@/lib/client";
import type { Schema } from "@/amplify/data/resource";
import { useSociety } from "@/components/SocietyContext";
import { Button, Card, ErrorBox, Field, Input, PageHeader, Spinner } from "@/components/ui";
import SystemCheck from "@/components/SystemCheck";

type Society = Schema["Society"]["type"];

export default function SettingsPage() {
  const { societyId } = useSociety();
  const [society, setSociety] = useState<Society | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");

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

  async function inviteAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = unwrap<{ invited: boolean; email: string; adminEmails: string[] }>(await client.mutations.inviteAdmin({ societyId, email: adminEmail }));
      setSociety((s) => (s ? { ...s, adminEmails: res.adminEmails } : s));
      setMsg(res.invited ? `Invitation emailed to ${res.email}.` : `${res.email} already had an account and is now an admin.`);
      setAdminEmail("");
    } catch (err) {
      setError(err);
    }
  }

  async function rotateToken() {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
    const res = await client.models.Society.update({ societyId, deviceToken: token });
    if (res.data) setSociety(res.data);
    setMsg("Device token rotated. Update your meters with the new token.");
  }

  async function resetDemo() {
    if (!confirm("Replace this society's data with sample data? All readings, supplies and tankers are replaced, and alerts, bills and insights are deleted. This can't be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = unwrap<{ readings: number; leakFlat: string }>(await client.mutations.seedDemoData({ societyId }));
      setMsg(`Sample data loaded: ${res.readings.toLocaleString("en-IN")} readings, with a leak in ${res.leakFlat} to find.`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!society) return error ? <ErrorBox error={error} /> : <Spinner />;
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Your society's details, who runs it, and how the backend is doing." />
      <ErrorBox error={error} />
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Society">
            <form onSubmit={save} className="space-y-4">
              <Field label="Name">
                <Input value={society.name} onChange={(e) => setSociety({ ...society, name: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="City">
                  <Input value={society.city ?? ""} onChange={(e) => setSociety({ ...society, city: e.target.value })} />
                </Field>
                <Field label="Common-area charge (₹/flat/month)">
                  <Input type="number" min={0} value={society.commonCharge ?? 0} onChange={(e) => setSociety({ ...society, commonCharge: Number(e.target.value) })} />
                </Field>
              </div>
              <Button type="submit">Save changes</Button>
            </form>
          </Card>
          <Card title="Committee members">
            <ul className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {(society.adminEmails ?? []).map((e) => (
                <li key={e ?? ""} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold uppercase text-brand-700">{(e ?? "?").slice(0, 2)}</span>
                  <span className="min-w-0 flex-1 truncate">{e}</span>
                  <span className="text-xs text-slate-400">admin</span>
                </li>
              ))}
            </ul>
            <form onSubmit={inviteAdmin} className="flex gap-2">
              <Input type="email" required placeholder="treasurer@email.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
              <Button type="submit">Invite admin</Button>
            </form>
            <p className="mt-2 text-xs text-slate-500">They get an email with a temporary password, full access to this society and its alert emails.</p>
          </Card>
        </div>
        <div className="space-y-6">
          <SystemCheck societyId={societyId} />
          <Card title="Smart meters">
            <p className="mb-3 text-sm text-slate-600">
              Meters send this device token in the <code>x-device-token</code> header. Connection details are on <Link href="/live" className="font-medium text-brand-700 underline underline-offset-2">Live meters</Link>.
            </p>
            <code className="block break-all rounded-lg bg-slate-100 p-2.5 text-xs">{society.deviceToken}</code>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Button variant="secondary" onClick={rotateToken}>
                Rotate token
              </Button>
              <span className="text-xs text-slate-400">
                Society ID <code>{societyId}</code>
              </span>
            </div>
          </Card>
          <Card title="Sample data" className="border-rose-200/80">
            <p className="mb-3 text-sm text-slate-600">Replaces all of this society&apos;s readings, bills and alerts with 6 months of sample data, for exploring or training. Don&apos;t use it once you have real data.</p>
            <Button variant="danger" onClick={resetDemo} disabled={busy}>
              {busy ? "Loading…" : "Replace with sample data"}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
