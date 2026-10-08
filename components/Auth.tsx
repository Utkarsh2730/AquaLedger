"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import { DEMO } from "@/lib/client";
import { DEMO_EMAIL } from "@/lib/demo/backend";

/**
 * Shown above the sign-in form only (the Authenticator's Header slot isn't rendered once the
 * user is signed in): a way back to the home page, and which sign-in this is.
 */
export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5 px-4 sm:px-0">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-lg py-1 pr-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:-ml-2 sm:px-2"
      >
        <span aria-hidden>←</span> Back to home
      </Link>
      <div className="mt-4 text-center">
        <div className="text-2xl font-semibold text-brand-700">💧 AquaLedger</div>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

const COMMITTEE = { title: "Committee sign in", subtitle: "For society committee members and facility managers." };
const RESIDENT = { title: "Resident sign in", subtitle: "Use the email your society committee invited." };

/** Cognito sign-in screen, or a pass-through in demo mode. */
export function AuthGate({ children, resident }: { children: ReactNode; resident?: boolean }) {
  if (DEMO) return <>{children}</>;
  const head = resident ? RESIDENT : COMMITTEE;
  return (
    <Authenticator className="pt-10" hideSignUp={resident} components={{ Header: () => <AuthHeader {...head} /> }}>
      {children}
    </Authenticator>
  );
}

export const COMMITTEE_HEADER = COMMITTEE;

// DEMO is a build-time constant, so each build always calls the same hooks.
function useDemoSession() {
  return { loginId: DEMO_EMAIL, signOut: () => window.location.assign("/") };
}
function useCognitoSession() {
  const { signOut, user } = useAuthenticator((c) => [c.user]);
  return { loginId: user?.signInDetails?.loginId, signOut };
}
export const useSession = DEMO ? useDemoSession : useCognitoSession;

export function DemoBanner() {
  if (!DEMO) return null;
  return (
    <div id="demo-banner" className="no-print bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
      Offline demo mode · no AWS needed · data is kept in this browser (Settings → Reset demo data to start over)
    </div>
  );
}
