"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertIcon, GaugeIcon, HomeIcon, ReceiptIcon, TruckIcon } from "@/components/landing/Icons";

export type AuthRole = "committee" | "resident";

const ROLE = {
  committee: {
    badge: "Committee console",
    headline: "Run your society’s water, end to end.",
    lead: "For committee members, treasurers and facility managers.",
    points: [
      { icon: AlertIcon, text: "Nightly leak scan across every flat" },
      { icon: ReceiptIcon, text: "Usage-based bills in one click" },
      { icon: TruckIcon, text: "Tanker forecast before summer hits" },
      { icon: GaugeIcon, text: "Live meters, alerts by email" },
    ],
    panel: "from-slate-950 via-slate-900 to-cyan-900",
    accent: "text-cyan-300",
    badgeTone: "bg-cyan-400/15 text-cyan-200 ring-cyan-300/30",
    title: "Committee sign in",
    hint: "New society? Choose Create Account, then set up your society in a minute.",
    switchText: "Resident?",
    switchLink: { href: "/resident", label: "Go to the resident portal" },
    theme: "auth-committee",
  },
  resident: {
    badge: "Resident portal",
    headline: "Your flat’s water, in plain numbers.",
    lead: "See what your home uses and what you pay, nothing else.",
    points: [
      { icon: HomeIcon, text: "Your usage against the building average" },
      { icon: ReceiptIcon, text: "Your monthly bill, explained line by line" },
      { icon: AlertIcon, text: "A heads-up if your flat may have a leak" },
    ],
    panel: "from-emerald-600 via-teal-600 to-teal-800",
    accent: "text-emerald-100",
    badgeTone: "bg-white/15 text-white ring-white/30",
    title: "Resident sign in",
    hint: "First time? Use your email and the temporary password from your invitation, then choose your own password.",
    switchText: "Committee member?",
    switchLink: { href: "/login", label: "Sign in to the committee console" },
    theme: "auth-resident",
  },
} as const;

/** What each role sees on the left: a small, honest preview of their side of the product. */
function Preview({ role }: { role: AuthRole }) {
  if (role === "resident") {
    return (
      <div className="rounded-2xl bg-white/95 p-4 text-slate-900 shadow-2xl shadow-black/20">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Flat B-202 · this month</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Below average</span>
        </div>
        <div className="mt-2 flex items-end gap-3">
          <div className="text-3xl font-semibold">8.1 kL</div>
          <div className="pb-1 text-sm text-slate-500">0.82× the building</div>
        </div>
        <div className="mt-3 flex h-12 items-end gap-1">
          {[5, 6, 5, 7, 6, 5, 6, 5, 6, 7, 5, 6].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-emerald-400" style={{ height: `${h * 13}%` }} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-600">September bill</span>
          <b>₹401</b>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        ["1", "leak caught", "text-rose-300"],
        ["40", "bills ready", "text-cyan-200"],
        ["12", "tankers next month", "text-amber-200"],
      ].map(([n, l, c]) => (
        <div key={l} className="rounded-xl bg-white/10 p-3 ring-1 ring-white/10">
          <div className={`text-2xl font-semibold ${c}`}>{n}</div>
          <div className="mt-0.5 text-xs text-slate-300">{l}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Split sign-in screen: a role-coloured panel saying whose door this is, and the form. Committee
 * and resident sign-in look deliberately different so nobody confuses the two.
 */
export default function AuthLayout({ role, children }: { role: AuthRole; children: ReactNode }) {
  const r = ROLE[role];
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className={`relative overflow-hidden bg-gradient-to-br ${r.panel} px-6 pb-8 pt-6 text-white lg:flex lg:flex-col lg:px-12 lg:py-10`}>
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <Link href="/" className="relative inline-flex items-center gap-1.5 rounded-lg py-1 pr-2 text-sm font-medium text-white/80 hover:text-white">
          <span aria-hidden>←</span> Back to home
        </Link>
        <div className="relative mt-6 lg:mt-auto">
          <div className="text-lg font-semibold">💧 AquaLedger</div>
          <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ${r.badgeTone}`}>{r.badge}</span>
          <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">{r.headline}</h2>
          <p className={`mt-3 ${r.accent}`}>{r.lead}</p>
          <ul className="mt-8 hidden space-y-3 lg:block">
            {r.points.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-white/90">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                  <p.icon className="h-5 w-5" />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
          <div className="mt-10 hidden max-w-sm lg:block">
            <Preview role={role} />
          </div>
        </div>
        <div className="relative mt-auto hidden pt-10 text-sm text-white/70 lg:block">
          {r.switchText}{" "}
          <Link href={r.switchLink.href} className="font-medium text-white underline-offset-4 hover:underline">
            {r.switchLink.label} →
          </Link>
        </div>
      </aside>

      <main className={`${r.theme} flex flex-col items-center justify-center px-4 py-10 lg:px-12`}>
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{r.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{r.hint}</p>
          <div className="mt-6">{children}</div>
          <p className="mt-6 text-center text-sm text-slate-500 lg:hidden">
            {r.switchText}{" "}
            <Link href={r.switchLink.href} className="font-medium text-slate-800 underline underline-offset-4">
              {r.switchLink.label}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

