"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import { DEMO, getRoles } from "@/lib/client";
import BackendGate from "@/components/BackendGate";
import { SignedIn } from "@/components/Auth";
import { Spinner } from "@/components/ui";

function Redirect() {
  const router = useRouter();
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    getRoles().then((r) => {
      router.replace(r.societyIds.length ? "/dashboard" : "/onboarding");
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
      <Authenticator.Provider>
        <SignedIn>
          <Redirect />
        </SignedIn>
      </Authenticator.Provider>
    </BackendGate>
  );
}
