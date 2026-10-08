"use client";

import { AuthGate } from "@/components/Auth";
import BackendGate from "@/components/BackendGate";
import AdminShell from "@/components/AdminShell";
import { SocietyProvider } from "@/components/SocietyContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <BackendGate>
      <AuthGate>
        {/* the shell shows the society's name and open alerts, so it sits inside the provider */}
        <SocietyProvider>
          <AdminShell>{children}</AdminShell>
        </SocietyProvider>
      </AuthGate>
    </BackendGate>
  );
}
