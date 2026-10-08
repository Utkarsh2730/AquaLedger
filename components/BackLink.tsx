"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { pageName, previousPage } from "@/lib/navHistory";
import { ArrowLeftIcon } from "./icons";

const STYLES = {
  light: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-brand-500",
  dark: "text-white/80 hover:bg-white/10 hover:text-white focus-visible:ring-white/60",
};

/**
 * The one Back button: goes to the page you came from inside AquaLedger and names it
 * ("Back to Leak alerts"); opened directly, it goes to `fallback` instead.
 */
export default function BackLink({
  fallback,
  fallbackLabel,
  tone = "light",
  remember = true,
  className = "",
}: {
  fallback: string;
  fallbackLabel: string;
  tone?: keyof typeof STYLES;
  /** false: always go to `fallback` (e.g. sign-in screens, which aren't part of the app's history) */
  remember?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const [target, setTarget] = useState({ href: fallback, label: fallbackLabel });

  useEffect(() => {
    if (!remember) return;
    const prev = previousPage(pathname + window.location.search);
    const name = prev && pageName(prev);
    if (prev && name) setTarget({ href: prev, label: `Back to ${name}` });
  }, [pathname, remember]);

  return (
    <Link
      href={target.href}
      className={`no-print -ml-2.5 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 ${STYLES[tone]} ${className}`}
    >
      <ArrowLeftIcon width={18} height={18} />
      {target.label}
    </Link>
  );
}
