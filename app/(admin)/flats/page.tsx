"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { client, flatLabelOf, fmtDate, loadFlats, type FlatModel } from "@/lib/client";
import ResidentAccess from "@/components/ResidentAccess";
import ResidentContacts from "@/components/ResidentContacts";
import { useSociety } from "@/components/SocietyContext";
import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, Spinner, Table, Td } from "@/components/ui";

export default function FlatsPage() {
  const { societyId } = useSociety();
  const [flats, setFlats] = useState<FlatModel[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [accessFor, setAccessFor] = useState<FlatModel | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [newFlat, setNewFlat] = useState({ block: "", number: "", occupants: 3 });
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => loadFlats(societyId).then(setFlats).catch(setError), [societyId]);
  useEffect(() => {
    load();
  }, [load]);

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
  const shown = flats.filter((f) => flatLabelOf(f).toLowerCase().includes(filter.toLowerCase()));
  const withAccess = flats.filter((f) => f.accessIssuedAt).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Flats" subtitle={`${flats.length} flats · ${withAccess} with resident access`} />
      <ErrorBox error={error} />
      {accessFor && (
        <ResidentAccess
          societyId={societyId}
          flat={accessFor}
          onClose={() => setAccessFor(null)}
          onChanged={() => loadFlats(societyId).then((all) => {
            setFlats(all);
            setAccessFor((cur) => all.find((x) => x.id === cur?.id) ?? cur);
          })}
        />
      )}
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
      <ResidentContacts societyId={societyId} flats={flats} onChanged={() => loadFlats(societyId).then(setFlats)} />
      <Card action={<Input placeholder="Search flats" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />}>
        {shown.length === 0 ? (
          <Empty>No flats match.</Empty>
        ) : (
          <Table head={["Flat", "People", "Resident access", ""]}>
            {shown.map((f) => (
              <tr key={f.id}>
                <Td>
                  <Link href={`/flats/detail?id=${encodeURIComponent(f.id)}`} className="font-medium text-brand-700 hover:underline">
                    {flatLabelOf(f)}
                  </Link>
                </Td>
                <Td>{f.occupants ?? "—"}</Td>
                <Td>
                  {f.accessIssuedAt ? <Badge tone="good">Active since {fmtDate(f.accessIssuedAt.slice(0, 10))}</Badge> : <span className="text-slate-400">Not given</span>}
                  <ContactCount emails={f.residentEmails} phones={f.residentPhones} />
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="secondary" onClick={() => setAccessFor(f)}>
                      {f.accessIssuedAt ? "Manage access" : "Give access"}
                    </Button>
                    <Button variant="ghost" onClick={() => removeFlat(f)} aria-label={`Remove ${flatLabelOf(f)}`}>
                      ✕
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function ContactCount({ emails, phones }: { emails?: (string | null)[] | null; phones?: (string | null)[] | null }) {
  const e = (emails ?? []).filter(Boolean) as string[];
  const p = (phones ?? []).filter(Boolean) as string[];
  if (!e.length && !p.length) return null;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return (
    <div className="mt-0.5 text-xs text-slate-500" title={[...e, ...p].join(", ")}>
      {[e.length && `✉ ${plural(e.length, "email")}`, p.length && `📱 ${plural(p.length, "mobile")}`].filter(Boolean).join(" · ")}
    </div>
  );
}
