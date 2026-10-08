"use client";

import type { ReactNode } from "react";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import { DEMO } from "@/lib/client";
import { DEMO_EMAIL } from "@/lib/demo/backend";

/** Cognito sign-in screen, or a pass-through in demo mode. */
export function AuthGate({ children, hideSignUp }: { children: ReactNode; hideSignUp?: boolean }) {
  if (DEMO) return <>{children}</>;
  return (
    <Authenticator className="pt-16" hideSignUp={hideSignUp}>
      {children}
    </Authenticator>
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
    <div className="no-print bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
      Offline demo mode · no AWS needed · data is kept in this browser (Settings → Reset demo data to start over)
    </div>
  );
}
