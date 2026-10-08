"use client";

import { useCallback, useEffect, useState } from "react";
import { client, fmtDate, inr, kl, listAll } from "@/lib/client";
import type { Schema } from "@/amplify/data/resource";
import { useSociety } from "@/components/SocietyContext";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";

type Tanker = Schema["TankerDelivery"]["type"];
type Supply = Schema["SourceSupply"]["type"];
const today = () => new Date().toISOString().slice(0, 10);

export default function SourcesPage() {
  const { societyId } = useSociety();
  const [tankers, setTankers] = useState<Tanker[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [showAll, setShowAll] = useState({ tankers: false, supplies: false });
  const PAGE = 12;

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([
        listAll<Tanker>((nextToken) => client.models.TankerDelivery.listTankersBySociety({ societyId }, { sortDirection: "DESC", limit: 100, nextToken }), 100),
        listAll<Supply>((nextToken) => client.models.SourceSupply.listSuppliesBySociety({ societyId }, { sortDirection: "DESC", limit: 100, nextToken }), 100),
      ]);
      setTankers(t);
      setSupplies(s);
    } catch (err) {
      setError(err);
    }
  }, [societyId]);
  useEffect(() => {
    load();
  }, [load]);

  const [tk, setTk] = useState({ vendor: "", litres: 10000, cost: 1800, date: today() });
  const [sp, setSp] = useState<{ type: "municipal" | "borewell"; litres: number; cost: number; date: string }>({ type: "municipal", litres: 50000, cost: 1100, date: today() });

  async function addTanker(e: React.FormEvent) {
    e.preventDefault();
    const res = await client.models.TankerDelivery.create({ societyId, ...tk });
    if (res.errors?.length) return setError(new Error(res.errors[0].message));
    setTk({ ...tk, vendor: tk.vendor });
    load();
  }
  async function addSupply(e: React.FormEvent) {
    e.preventDefault();
    const res = await client.models.SourceSupply.create({ societyId, ...sp });
    if (res.errors?.length) return setError(new Error(res.errors[0].message));
    load();
  }
  async function remove(kind: "tanker" | "supply", id: string) {
    if (!confirm("Delete this entry?")) return;
    if (kind === "tanker") await client.models.TankerDelivery.delete({ id });
    else await client.models.SourceSupply.delete({ id });
    load();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Water sources" subtitle="Log every tanker and the municipal / borewell supply so cost per kL is accurate." />
      <ErrorBox error={error} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="🚚 Log a tanker delivery">
          <form onSubmit={addTanker} className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Vendor">
                <Input required value={tk.vendor} onChange={(e) => setTk({ ...tk, vendor: e.target.value })} placeholder="Shree Balaji Tankers" />
              </Field>
            </div>
            <Field label="Litres">
              <Input type="number" min={1} required value={tk.litres} onChange={(e) => setTk({ ...tk, litres: Number(e.target.value) })} />
            </Field>
            <Field label="Cost (₹)">
              <Input type="number" min={0} required value={tk.cost} onChange={(e) => setTk({ ...tk, cost: Number(e.target.value) })} />
            </Field>
            <Field label="Date">
              <Input type="date" required value={tk.date} onChange={(e) => setTk({ ...tk, date: e.target.value })} />
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Add tanker
              </Button>
            </div>
          </form>
        </Card>
        <Card title="🚰 Log municipal / borewell supply">
          <form onSubmit={addSupply} className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Source">
                <Select value={sp.type} onChange={(e) => setSp({ ...sp, type: e.target.value as "municipal" | "borewell" })}>
                  <option value="municipal">Municipal supply</option>
                  <option value="borewell">Borewell (cost = pump electricity)</option>
                </Select>
              </Field>
            </div>
            <Field label="Litres">
              <Input type="number" min={1} required value={sp.litres} onChange={(e) => setSp({ ...sp, litres: Number(e.target.value) })} />
            </Field>
            <Field label="Cost (₹)">
              <Input type="number" min={0} required value={sp.cost} onChange={(e) => setSp({ ...sp, cost: Number(e.target.value) })} />
            </Field>
            <Field label="Date">
              <Input type="date" required value={sp.date} onChange={(e) => setSp({ ...sp, date: e.target.value })} />
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Add supply
              </Button>
            </div>
          </form>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={`Tanker history (${tankers.length})`}
          action={
            tankers.length > PAGE && (
              <Button variant="ghost" onClick={() => setShowAll((s) => ({ ...s, tankers: !s.tankers }))}>
                {showAll.tankers ? "Show latest" : `Show all ${tankers.length}`}
              </Button>
            )
          }
        >
          {tankers.length === 0 ? (
            <Empty>No tankers logged yet.</Empty>
          ) : (
            <Table head={["Date", "Vendor", "Volume", "Cost", "₹/kL", ""]}>
              {(showAll.tankers ? tankers : tankers.slice(0, PAGE)).map((t) => (
                <tr key={t.id}>
                  <Td>{fmtDate(t.date)}</Td>
                  <Td>{t.vendor}</Td>
                  <Td>{kl(t.litres)}</Td>
                  <Td>{inr(t.cost)}</Td>
                  <Td>{inr((t.cost / t.litres) * 1000)}</Td>
                  <Td>
                    <button onClick={() => remove("tanker", t.id)} className="text-xs text-slate-400 hover:text-rose-600">
                      delete
                    </button>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card
          title={`Supply history (${supplies.length})`}
          action={
            supplies.length > PAGE && (
              <Button variant="ghost" onClick={() => setShowAll((s) => ({ ...s, supplies: !s.supplies }))}>
                {showAll.supplies ? "Show latest" : `Show all ${supplies.length}`}
              </Button>
            )
          }
        >
          {supplies.length === 0 ? (
            <Empty>No supply logged yet.</Empty>
          ) : (
            <Table head={["Date", "Source", "Volume", "Cost", ""]}>
              {(showAll.supplies ? supplies : supplies.slice(0, PAGE)).map((s) => (
                <tr key={s.id}>
                  <Td>{fmtDate(s.date)}</Td>
                  <Td>
                    <Badge tone={s.type === "municipal" ? "info" : "good"}>{s.type}</Badge>
                  </Td>
                  <Td>{kl(s.litres)}</Td>
                  <Td>{inr(s.cost)}</Td>
                  <Td>
                    <button onClick={() => remove("supply", s.id)} className="text-xs text-slate-400 hover:text-rose-600">
                      delete
                    </button>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
