"use client";

import type { ReactNode } from "react";
import { BACKEND_READY } from "@/lib/client";

/**
 * App pages need the AWS backend. When amplify_outputs.json is only the placeholder (fresh copy
 * of the code, sandbox never run), explain what to do instead of failing with auth errors.
 */
export default function BackendGate({ children }: { children: ReactNode }) {
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
        <a href="/" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
          ← Back to the home page
        </a>
      </div>
    </div>
  );
}
