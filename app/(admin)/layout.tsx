"use client";

import { AuthGate } from "@/components/Auth";
import BackendGate from "@/components/BackendGate";
import AdminShell from "@/components/AdminShell";
import { SocietyProvider } from "@/components/SocietyContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <BackendGate>
      <AuthGate>
        <AdminShell>
          <SocietyProvider>{children}</SocietyProvider>
        </AdminShell>
      </AuthGate>
    </BackendGate>
  );
}
