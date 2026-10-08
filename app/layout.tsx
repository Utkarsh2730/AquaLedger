import type { Metadata } from "next";
import "./globals.css";
import ConfigureAmplify from "@/components/ConfigureAmplify";

export const metadata: Metadata = {
  title: "AquaLedger — water management for apartment societies",
  description: "Track every litre, catch leaks automatically, bill each flat by actual usage and forecast tanker needs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <ConfigureAmplify />
        {children}
      </body>
    </html>
  );
}
