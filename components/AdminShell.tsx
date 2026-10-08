"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { DemoBanner, useSession } from "./Auth";
import { useSociety } from "./SocietyContext";
import { client } from "@/lib/client";
import {
  AlertIcon,
  BuildingIcon,
  CloseIcon,
  DashboardIcon,
  DropIcon,
  LogoutIcon,
  MenuIcon,
  PulseIcon,
  ReceiptIcon,
  SettingsIcon,
  SparklesIcon,
  TruckIcon,
} from "./icons";

const NAV = [
  {
    group: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
      { href: "/live", label: "Live meters", Icon: PulseIcon },
      { href: "/alerts", label: "Leak alerts", Icon: AlertIcon, badge: "alerts" as const },
    ],
  },
  {
    group: "Money & planning",
    items: [
      { href: "/bills", label: "Bills", Icon: ReceiptIcon },
      { href: "/insights", label: "Forecast & AI", Icon: SparklesIcon },
    ],
  },
  {
    group: "Society",
    items: [
      { href: "/flats", label: "Flats & residents", Icon: BuildingIcon },
      { href: "/sources", label: "Water sources", Icon: TruckIcon },
      { href: "/readings", label: "Meter readings", Icon: DropIcon },
      { href: "/settings", label: "Settings", Icon: SettingsIcon },
    ],
  },
];

/** Society name and open-alert count for the sidebar; refreshed on every page change. */
function useShellInfo(societyId: string, pathname: string) {
  const [society, setSociety] = useState<{ name?: string | null; city?: string | null } | null>(null);
  const [openAlerts, setOpenAlerts] = useState(0);
  useEffect(() => {
    if (!societyId) return;
    let live = true;
    client.models.Society.get({ societyId })
      .then((r) => live && r.data && setSociety({ name: r.data.name, city: r.data.city }))
      .catch(() => {});
    client.models.Alert.listAlertsBySociety({ societyId }, { limit: 500 })
      .then((r) => live && setOpenAlerts((r.data ?? []).filter((a) => a && !a.resolved).length))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [societyId, pathname]);
  return { society, openAlerts };
}

const initials = (s?: string) =>
  (s ?? "?")
    .split("@")[0]
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]!.toUpperCase())
    .join("") || "?";

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { societyId } = useSociety();
  const { signOut, loginId } = useSession();
  const [open, setOpen] = useState(false);
  const { society, openAlerts } = useShellInfo(societyId, pathname);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" className="flex items-center gap-2 px-3 text-lg font-semibold text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
          <DropIcon width={18} height={18} />
        </span>
        AquaLedger
      </Link>

      {society?.name && (
        <div className="mx-1 mt-5 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-cyan-300/80">Committee console</div>
          <div className="mt-0.5 truncate text-sm font-semibold text-white" title={society.name}>
            {society.name}
          </div>
          {society.city && <div className="truncate text-xs text-slate-400">{society.city}</div>}
        </div>
      )}

      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto" aria-label="Main">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.group}</div>
            <div className="space-y-0.5">
              {g.items.map(({ href, label, Icon, badge }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active ? "bg-cyan-400/15 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className={active ? "text-cyan-300" : "text-slate-400 group-hover:text-slate-200"} />
                    <span className="flex-1">{label}</span>
                    {badge === "alerts" && openAlerts > 0 && (
                      <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white" aria-label={`${openAlerts} open`}>
                        {openAlerts}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 flex items-center gap-3 border-t border-white/10 px-2 pt-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-semibold text-cyan-200">{initials(loginId)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-slate-300" title={loginId}>
            {loginId}
          </div>
          <div className="text-[11px] text-slate-500">Committee member</div>
        </div>
        <button onClick={signOut} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Sign out" title="Sign out">
          <LogoutIcon width={18} height={18} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <DemoBanner />
      <div className="min-h-screen md:flex">
        <aside className="no-print hidden w-64 shrink-0 bg-slate-950 px-3 py-5 md:sticky md:top-0 md:block md:h-screen">{sidebar}</aside>

        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 bg-slate-950 px-4 py-3 text-white md:hidden">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-semibold">
            <DropIcon width={18} height={18} className="shrink-0 text-cyan-300" />
            <span className="truncate">{society?.name ?? "AquaLedger"}</span>
          </Link>
          <button onClick={() => setOpen(true)} className="relative rounded-lg p-2 ring-1 ring-white/15" aria-label="Open menu" aria-expanded={open}>
            <MenuIcon />
            {openAlerts > 0 && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-rose-500 ring-2 ring-slate-950" />}
          </button>
        </header>

        {open && (
          <div className="no-print fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-slate-950/60" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-950 px-3 py-5 shadow-2xl">
              <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-2 text-slate-400 hover:text-white" aria-label="Close menu">
                <CloseIcon />
              </button>
              {sidebar}
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </>
  );
}
