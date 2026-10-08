"use client";

import type { ReactNode } from "react";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import AuthLayout, { type AuthRole } from "./AuthLayout";
import { Spinner } from "./ui";
import { DEMO } from "@/lib/client";
import { DEMO_EMAIL } from "@/lib/demo/backend";

/** Cognito sign-in (in a role-specific layout), or a pass-through in demo mode. */
export function AuthGate({ children, resident }: { children: ReactNode; resident?: boolean }) {
  if (DEMO) return <>{children}</>;
  return (
    <Authenticator.Provider>
      <SignedIn role={resident ? "resident" : "committee"}>{children}</SignedIn>
    </Authenticator.Provider>
  );
}

/** children once signed in; otherwise the sign-in screen for this role */
export function SignedIn({ role, children }: { role: AuthRole; children: ReactNode }) {
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);
  if (authStatus === "authenticated") return <>{children}</>;
  if (authStatus === "configuring") return <Spinner />;
  return (
    <AuthLayout role={role}>
      <Authenticator hideSignUp={role === "resident"} />
    </AuthLayout>
  );
}

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
