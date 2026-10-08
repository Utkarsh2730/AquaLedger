"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import AdminShell from "@/components/AdminShell";
import { SocietyProvider } from "@/components/SocietyContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Authenticator className="pt-16">
      <AdminShell>
        <SocietyProvider>{children}</SocietyProvider>
      </AdminShell>
    </Authenticator>
  );
}
