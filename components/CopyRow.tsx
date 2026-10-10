"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/** Copy-to-clipboard value row for the meter connection details. */
export default function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
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
