"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import { DEMO, getRoles } from "@/lib/client";
import BackendGate from "@/components/BackendGate";
import { SignedIn } from "@/components/Auth";
import { Spinner } from "@/components/ui";
import AuthLayout from "@/components/AuthLayout";

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

/** never resolves: the page is navigating away */
const leave = (path: string) => {
  window.location.assign(path);
  return new Promise<never>(() => {});
};

/**
 * The real committee sign-in screen in the offline demo: same Amplify Authenticator and layout as
 * the live app, but with the Cognito calls answered locally. Signing in opens the dashboard;
 * creating an account shows the email-code step, then society setup.
 */
function DemoLogin() {
  return (
    <AuthLayout role="committee">
      <Authenticator
        services={{
          getAmplifyConfig: async () => ({
            loginMechanisms: ["email"],
            signUpAttributes: [],
            socialProviders: [],
            passwordlessCapabilities: { emailOtpEnabled: false, smsOtpEnabled: false, webAuthnEnabled: false, preferredChallenge: undefined },
            userPoolClientId: "demo",
            userPoolId: "demo",
          }),
          getCurrentUser: async () => {
            throw new Error("not signed in");
          },
          handleSignIn: () => leave("/dashboard"),
          handleSignUp: async (input: unknown) => ({
            isSignUpComplete: false,
            userId: "demo-user",
            nextStep: {
              signUpStep: "CONFIRM_SIGN_UP",
              codeDeliveryDetails: { deliveryMedium: "EMAIL", destination: String((input as { username?: string }).username ?? "").replace(/^(.).*@/, "$1***@"), attributeName: "email" },
            },
          }),
          handleConfirmSignUp: () => leave("/onboarding"),
        }}
      />
    </AuthLayout>
  );
}

export default function LoginPage() {
  if (DEMO) return <DemoLogin />;
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
