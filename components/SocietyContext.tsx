"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DEMO, getRoles } from "@/lib/client";
import { Spinner } from "./ui";

interface SocietyCtx {
  societyId: string;
  /** re-read Cognito groups (needed right after creating a society) */
  refresh: () => Promise<void>;
}

const Ctx = createContext<SocietyCtx | null>(null);

export function useSociety() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSociety must be used inside <SocietyProvider>");
  return v;
}

/** Resolves which society the signed-in admin manages, routing to onboarding/resident as needed. */
export function SocietyProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // next.config uses trailingSlash, so paths arrive as "/onboarding/"
  const onOnboarding = usePathname().replace(/\/+$/, "") === "/onboarding";
  const [societyId, setSocietyId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const load = useCallback(
    async (force = false) => {
      // On onboarding, always use a fresh token so a society created earlier (or by a request
      // that timed out in the browser) is seen and not created twice.
      const roles = await getRoles(force || onOnboarding);
      const id = roles.societyIds[0] ?? null;
      setSocietyId(id);
      setChecked(true);
      if (!id && !onOnboarding) router.replace("/onboarding");
      // the offline demo always has its sample society, but still shows setup after "Create Account"
      else if (id && onOnboarding && !force && !DEMO) router.replace("/dashboard");
    },
    [router, onOnboarding]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!checked) return <Spinner />;
  if (onOnboarding) return <Ctx.Provider value={{ societyId: societyId ?? "", refresh: () => load(true) }}>{children}</Ctx.Provider>;
  if (!societyId) return <Spinner label="Redirecting…" />;
  return <Ctx.Provider value={{ societyId, refresh: () => load(true) }}>{children}</Ctx.Provider>;
}
