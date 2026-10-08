"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import { DEMO, getRoles } from "@/lib/client";
import BackendGate from "@/components/BackendGate";
import { AuthHeader, COMMITTEE_HEADER } from "@/components/Auth";
import { Spinner } from "@/components/ui";

function Redirect() {
  const router = useRouter();
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    getRoles().then((r) => {
      if (r.societyIds.length) router.replace("/dashboard");
      else if (r.isResident) router.replace("/resident");
      else router.replace("/onboarding");
    });
  }, [authStatus, router]);
  return <Spinner label="Signing you in…" />;
}

function DemoRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/dashboard"), [router]);
  return <Spinner label="Opening the demo…" />;
}

export default function LoginPage() {
  if (DEMO) return <DemoRedirect />;
  return (
    <BackendGate>
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <Authenticator initialState="signIn" components={{ Header: () => <AuthHeader {...COMMITTEE_HEADER} /> }}>
          <Redirect />
        </Authenticator>
      </div>
    </BackendGate>
  );
}
