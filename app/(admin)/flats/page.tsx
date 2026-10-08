"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { client, flatLabelOf, loadFlats, unwrap, type FlatModel } from "@/lib/client";
import { useSociety } from "@/components/SocietyContext";
import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, Spinner, Table, Td } from "@/components/ui";

export default function FlatsPage() {
  const { societyId } = useSociety();
  const [flats, setFlats] = useState<FlatModel[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => loadFlats(societyId).then(setFlats).catch(setError), [societyId]);
  useEffect(() => {
    load();
  }, [load]);

  async function invite(flatId: string) {
    setError(null);
    setMsg(null);
    try {
      const res = unwrap<{ invited: boolean; email: string; flat: string }>(await client.mutations.inviteResident({ societyId, flatId, email }));
      setMsg(res.invited ? `Invitation emailed to ${res.email} for ${res.flat}.` : `${res.email} already had an account and is now linked to ${res.flat}.`);
      setInviting(null);
      setEmail("");
      load();
    } catch (err) {
      setError(err);
    }
  }

  if (!flats) return error ? <ErrorBox error={error} /> : <Spinner />;
  const shown = flats.filter((f) => flatLabelOf(f).toLowerCase().includes(filter.toLowerCase()) || (f.residentEmail ?? "").includes(filter.toLowerCase()));
  return (
    <div className="space-y-6">
      <PageHeader title="Flats" subtitle={`${flats.length} flats · ${flats.filter((f) => f.residentEmail).length} residents invited`} />
      <ErrorBox error={error} />
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}
      <Card action={<Input placeholder="Search flat or email" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />}>
        {shown.length === 0 ? (
          <Empty>No flats match.</Empty>
        ) : (
          <Table head={["Flat", "Occupants", "Resident", ""]}>
            {shown.map((f) => (
              <tr key={f.id}>
                <Td>
                  <Link href={`/flats/detail?id=${encodeURIComponent(f.id)}`} className="font-medium text-brand-700 hover:underline">
                    {flatLabelOf(f)}
                  </Link>
                </Td>
                <Td>{f.occupants ?? "—"}</Td>
                <Td>{f.residentEmail ? <Badge tone="good">{f.residentEmail}</Badge> : <span className="text-slate-400">not invited</span>}</Td>
                <Td className="text-right">
                  {inviting === f.id ? (
                    <form
                      className="flex justify-end gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        invite(f.id);
                      }}
                    >
                      <Input type="email" required placeholder="resident@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-56" />
                      <Button type="submit">Send</Button>
                      <Button type="button" variant="ghost" onClick={() => setInviting(null)}>
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <Button variant="secondary" onClick={() => setInviting(f.id)}>
                      {f.residentEmail ? "Re-invite" : "Invite resident"}
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
