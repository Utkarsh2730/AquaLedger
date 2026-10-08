"use client";

import { useState } from "react";
import { client, fmtDateTime, unwrap } from "@/lib/client";
import { Button, Card, ErrorBox } from "./ui";

interface Check {
  id: string;
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  fix?: string;
}
interface Result {
  checkedAt: string;
  region?: string;
  overall: Check["status"];
  checks: Check[];
}

const ICON = { pass: "✅", warn: "⚠️", fail: "❌" } as const;
const TONE = {
  pass: "border-emerald-200 bg-emerald-50",
  warn: "border-amber-200 bg-amber-50",
  fail: "border-rose-200 bg-rose-50",
} as const;
const SUMMARY = { pass: "Everything is working.", warn: "Working, with things to finish.", fail: "Something needs fixing." } as const;

/** Runs the backend's systemCheck: database, nightly schedule, alert emails, meter endpoint, AI. */
export default function SystemCheck({ societyId }: { societyId: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(unwrap<Result>(await client.queries.systemCheck({ societyId })));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    const text = [
      `AquaLedger system check · ${fmtDateTime(result.checkedAt)}${result.region ? ` · ${result.region}` : ""}`,
      ...result.checks.map((c) => `${ICON[c.status]} ${c.name}: ${c.detail}${c.fix ? ` → ${c.fix}` : ""}`),
    ].join("\n");
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card
      title="System check"
      action={
        <div className="flex gap-2">
          {result && (
            <Button variant="ghost" onClick={copy}>
              {copied ? "Copied ✓" : "Copy results"}
            </Button>
          )}
          <Button variant="secondary" onClick={run} disabled={busy}>
            {busy ? "Checking…" : result ? "Run again" : "Run check"}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-slate-600">Tests the live backend: database, nightly leak scan, alert emails, smart-meter endpoint and AI.</p>
      <ErrorBox error={error} />
      {result && (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-semibold">
            {ICON[result.overall]} {SUMMARY[result.overall]}
          </div>
          {result.checks.map((c) => (
            <div key={c.id} className={`rounded-lg border p-3 text-sm ${TONE[c.status]}`}>
              <div className="font-medium">
                {ICON[c.status]} {c.name}
              </div>
              <div className="mt-0.5 break-words text-slate-700">{c.detail}</div>
              {c.fix && <div className="mt-1 break-words text-slate-600">→ {c.fix}</div>}
            </div>
          ))}
          <p className="text-xs text-slate-500">
            Checked {fmtDateTime(result.checkedAt)}
            {result.region ? ` · ${result.region}` : ""}
          </p>
        </div>
      )}
    </Card>
  );
}
