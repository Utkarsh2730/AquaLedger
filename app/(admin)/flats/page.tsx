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
  const [newFlat, setNewFlat] = useState({ block: "", number: "", occupants: 3 });
  const [adding, setAdding] = useState(false);

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

  async function addFlat(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    const block = newFlat.block.trim().toUpperCase();
    const number = newFlat.number.trim().toUpperCase();
    setAdding(true);
    try {
      // check against fresh data, not the list on screen (another admin, or a double click, may have added it)
      const current = await loadFlats(societyId);
      if (current.some((f) => f.block === block && f.number === number)) throw new Error(`Flat ${block}-${number} already exists`);
      const res = await client.models.Flat.create({ societyId, block, number, occupants: newFlat.occupants });
      if (res.errors?.length) throw new Error(res.errors[0].message);
      setFlats(await loadFlats(societyId));
      setMsg(`Added flat ${block}-${number}.`);
      setNewFlat({ ...newFlat, number: "" });
    } catch (err) {
      setError(err);
    } finally {
      setAdding(false);
    }
  }

  async function removeFlat(f: FlatModel) {
    if (!confirm(`Remove flat ${flatLabelOf(f)}? Its past readings and bills are kept.`)) return;
    const res = await client.models.Flat.delete({ id: f.id });
    if (res.errors?.length) return setError(new Error(res.errors[0].message));
    load();
  }

  if (!flats) return error ? <ErrorBox error={error} /> : <Spinner />;
  const shown = flats.filter((f) => flatLabelOf(f).toLowerCase().includes(filter.toLowerCase()) || (f.residentEmail ?? "").includes(filter.toLowerCase()));
  return (
    <div className="space-y-6">
      <PageHeader title="Flats" subtitle={`${flats.length} flats · ${flats.filter((f) => f.residentEmail).length} residents invited`} />
      <ErrorBox error={error} />
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}
      <Card title="Add a flat">
        <form onSubmit={addFlat} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Block</span>
            <Input required value={newFlat.block} onChange={(e) => setNewFlat({ ...newFlat, block: e.target.value })} placeholder="E" className="w-20" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Number</span>
            <Input required value={newFlat.number} onChange={(e) => setNewFlat({ ...newFlat, number: e.target.value })} placeholder="101" className="w-24" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Occupants</span>
            <Input type="number" min={0} value={newFlat.occupants} onChange={(e) => setNewFlat({ ...newFlat, occupants: Number(e.target.value) })} className="w-24" />
          </label>
          <Button type="submit" disabled={adding}>
            {adding ? "Adding…" : "Add flat"}
          </Button>
        </form>
      </Card>
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
                    <div className="flex justify-end gap-1">
                      <Button variant="secondary" onClick={() => setInviting(f.id)}>
                        {f.residentEmail ? "Re-invite" : "Invite resident"}
                      </Button>
                      <Button variant="ghost" onClick={() => removeFlat(f)} aria-label={`Remove ${flatLabelOf(f)}`}>
                        ✕
                      </Button>
                    </div>
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
