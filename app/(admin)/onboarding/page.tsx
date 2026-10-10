"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { client, unwrap } from "@/lib/client";
import { useSociety } from "@/components/SocietyContext";
import { Button, Card, ErrorBox, Field, Input, PageHeader } from "@/components/ui";

export default function OnboardingPage() {
  const router = useRouter();
  const { refresh } = useSociety();
  const [name, setName] = useState("Green Meadows CHS");
  const [city, setCity] = useState("Pune");
  const [blocks, setBlocks] = useState("A, B, C, D");
  const [perBlock, setPerBlock] = useState(10);
  const [commonCharge, setCommonCharge] = useState(150);
  const [seedDemo, setSeedDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await client.mutations.setupSociety({
          name,
          city,
          blocks: blocks.split(",").map((b) => b.trim()).filter(Boolean),
          flatsPerBlock: perBlock,
          commonCharge,
          seedDemo,
        })
      );
      await refresh(); // pick up the new society group in a fresh token
      router.replace("/dashboard");
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const flats = blocks.split(",").filter((b) => b.trim()).length * perBlock;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Set up your society" subtitle="Takes 30 seconds. You become the society admin." />
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Society name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Blocks / wings" hint="Comma separated">
              <Input value={blocks} onChange={(e) => setBlocks(e.target.value)} required />
            </Field>
            <Field label="Flats per block">
              <Input type="number" min={1} max={60} value={perBlock} onChange={(e) => setPerBlock(Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Common-area charge per flat (₹/month)" hint="Fixed part of every bill: lobby, garden, pool">
            <Input type="number" min={0} value={commonCharge} onChange={(e) => setCommonCharge(Number(e.target.value))} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={seedDemo} onChange={(e) => setSeedDemo(e.target.checked)} className="mt-1" />
            <span>
              <b>Start with 6 months of sample data</b>
              <br />
              <span className="text-slate-500">To explore before your own readings arrive: summer spikes, tanker deliveries and a leak in flat B-202. You can replace it any time.</span>
            </span>
          </label>
          <ErrorBox error={error} />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating society…" : `Create society with ${flats} flats`}
          </Button>
          <p className="text-xs text-slate-500">You will get an email from AWS to confirm leak and bill alerts. Click the link in it to receive alerts.</p>
        </form>
      </Card>
    </div>
  );
}
