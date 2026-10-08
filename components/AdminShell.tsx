"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/live", label: "Live meters", icon: "📡" },
  { href: "/alerts", label: "Leak alerts", icon: "🚨" },
  { href: "/bills", label: "Bills", icon: "🧾" },
  { href: "/insights", label: "Forecast & AI", icon: "✨" },
  { href: "/flats", label: "Flats", icon: "🏢" },
  { href: "/sources", label: "Water sources", icon: "🚚" },
  { href: "/readings", label: "Meter readings", icon: "💧" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { signOut, user } = useAuthenticator((c) => [c.user]);
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="space-y-1">
      {NAV.map((n) => {
        const active = pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <span aria-hidden>{n.icon}</span>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2 text-lg font-semibold text-brand-700">
          💧 AquaLedger
        </Link>
        {nav}
        <div className="mt-auto border-t border-slate-200 pt-4 text-xs text-slate-500">
          <div className="truncate px-2">{user?.signInDetails?.loginId}</div>
          <button onClick={signOut} className="mt-2 px-2 font-medium text-slate-700 hover:underline">
            Sign out
          </button>
        </div>
      </aside>
      <header className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <span className="font-semibold text-brand-700">💧 AquaLedger</span>
        <button onClick={() => setOpen(!open)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">
          Menu
        </button>
      </header>
      {open && (
        <div className="no-print border-b border-slate-200 bg-white p-4 md:hidden">
          {nav}
          <button onClick={signOut} className="mt-3 px-3 text-sm font-medium text-slate-700">
            Sign out
          </button>
        </div>
      )}
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
