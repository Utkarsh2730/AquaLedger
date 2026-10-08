"use client";

import type { ReactNode } from "react";
import { BACKEND_MISSING, BACKEND_READY } from "@/lib/client";
import BackLink from "./BackLink";

/**
 * App pages need the AWS backend. When amplify_outputs.json is only the placeholder (fresh copy
 * of the code, sandbox never run), explain what to do instead of failing with auth errors.
 */
export default function BackendGate({ children }: { children: ReactNode }) {
  if (BACKEND_READY && BACKEND_MISSING.length) return <UpdateBackend missing={BACKEND_MISSING} />;
  if (BACKEND_READY) return <>{children}</>;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-lg font-semibold text-brand-700">💧 AquaLedger</div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Connect your AWS backend</h1>
        <p className="mt-2 text-sm text-slate-600">
          This copy of the app hasn&apos;t been connected to AWS yet (<code>amplify_outputs.json</code> is only a placeholder). Pick one:
        </p>
        <div className="mt-6 space-y-4 text-sm">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="font-semibold">Use your AWS account</div>
            <p className="mt-1 text-slate-600">In a terminal in the project folder, run this and wait for “Deployment completed”, then reload this page:</p>
            <pre className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">npx ampx sandbox</pre>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="font-semibold">Try it offline, no AWS needed</div>
            <p className="mt-1 text-slate-600">Stop this server (Control + C) and start the demo instead:</p>
            <pre className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">npm run demo</pre>
          </div>
        </div>
        <BackLink fallback="/" fallbackLabel="Back to home" remember={false} className="mt-6" />
      </div>
    </div>
  );
}

/** The code was updated (git pull) but the AWS backend still runs the previous version. */
function UpdateBackend({ missing }: { missing: string[] }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-lg font-semibold text-brand-700">💧 AquaLedger</div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Update your AWS backend</h1>
        <p className="mt-2 text-sm text-slate-600">
          This version of the app is newer than the backend running in your AWS account, so some features would fail. Redeploy the backend once and it&apos;s fixed.
        </p>
        <ol className="mt-6 space-y-3 text-sm">
          <li className="rounded-xl bg-slate-50 p-4">
            <b>1.</b> In the Terminal window running <code>npx ampx sandbox</code>, press <b>Control + C</b> to stop it. (No such window? Open a new one in the project folder.)
          </li>
          <li className="rounded-xl bg-slate-50 p-4">
            <b>2.</b> Start it again and wait for <b>“Deployment completed”</b> (a few minutes):
            <pre className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">npm install{"\n"}npx ampx sandbox</pre>
          </li>
          <li className="rounded-xl bg-slate-50 p-4">
            <b>3.</b> Reload this page. If the deploy stops with an error instead, copy its last lines: they say what AWS refused.
          </li>
        </ol>
        <details className="mt-4 text-xs text-slate-500">
          <summary className="cursor-pointer">What&apos;s missing</summary>
          <p className="mt-2 font-mono">{missing.join(" · ")}</p>
        </details>
      </div>
    </div>
  );
}
