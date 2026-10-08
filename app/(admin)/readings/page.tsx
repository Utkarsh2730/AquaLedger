"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { client, flatLabelOf, fmtDateTime, listAll, loadFlats, unwrap, type FlatModel } from "@/lib/client";
import type { Schema } from "@/amplify/data/resource";
import { localToUtcIso } from "@/lib/core/time";
import { useSociety } from "@/components/SocietyContext";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";

type Reading = Schema["Reading"]["type"];
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

const SAMPLE = `flat,date,hour,litres
A-101,${yesterday()},,412
A-102,${yesterday()},,388
B-202,${yesterday()},3,21.5
`;

export default function ReadingsPage() {
  const { societyId } = useSociety();
  const [flats, setFlats] = useState<FlatModel[]>([]);
  const [recent, setRecent] = useState<Reading[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState({ flatId: "", day: yesterday(), litres: 400 });
  const [csvResult, setCsvResult] = useState<{ imported: number; errors: string[]; errorCount: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  const labels = useMemo(() => new Map(flats.map((f) => [f.id, flatLabelOf(f)])), [flats]);

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([
        loadFlats(societyId),
        listAll<Reading>((nextToken) => client.models.Reading.listReadingsBySociety({ societyId }, { sortDirection: "DESC", limit: 25, nextToken }), 25),
      ]);
      setFlats(f);
      setRecent(r);
      setForm((x) => ({ ...x, flatId: x.flatId || f[0]?.id || "" }));
    } catch (err) {
      setError(err);
    }
  }, [societyId]);
  useEffect(() => {
    load();
  }, [load]);

  async function addReading(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await client.models.Reading.create({
      societyId,
      flatId: form.flatId,
      timestamp: localToUtcIso(form.day, 0),
      periodMinutes: 1440,
      litres: form.litres,
      source: "manual",
    });
    if (res.errors?.length) return setError(new Error(res.errors[0].message));
    load();
  }

  async function uploadCsv(file: File) {
    setUploading(true);
    setError(null);
    setCsvResult(null);
    try {
      const csv = await file.text();
      if (csv.length > 900_000) throw new Error("CSV too large for one upload (max ~900 KB). Split it by month.");
      setCsvResult(unwrap(await client.mutations.importReadingsCsv({ societyId, csv })));
      load();
    } catch (err) {
      setError(err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Meter readings" subtitle="Enter a reading by hand, or upload the CSV your meter reader or vendor sends." />
      <ErrorBox error={error} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Manual entry (daily total)">
          <form onSubmit={addReading} className="grid grid-cols-3 gap-3">
            <Field label="Flat">
              <Select value={form.flatId} onChange={(e) => setForm({ ...form, flatId: e.target.value })}>
                {flats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {flatLabelOf(f)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date">
              <Input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />
            </Field>
            <Field label="Litres">
              <Input type="number" min={0} value={form.litres} onChange={(e) => setForm({ ...form, litres: Number(e.target.value) })} />
            </Field>
            <Button type="submit" className="col-span-3">
              Save reading
            </Button>
          </form>
        </Card>
        <Card title="CSV upload">
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">
              Columns: <code>flat, date, hour, litres</code>. Leave <code>hour</code> empty for a daily total; fill it (0-23) for hourly readings, which power the 2-4 a.m. leak check.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && uploadCsv(e.target.files[0])}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-white"
            />
            <a download="aqualedger-sample.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`} className="text-brand-700 underline">
              Download sample CSV
            </a>
            {uploading && <p>Importing…</p>}
            {csvResult && (
              <div className="rounded-lg bg-slate-50 p-3">
                <b>{csvResult.imported}</b> readings imported{csvResult.errorCount ? `, ${csvResult.errorCount} rows skipped:` : "."}
                {csvResult.errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-rose-700">
                    {csvResult.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
      <Card title="Latest readings">
        {recent.length === 0 ? (
          <Empty>No readings yet.</Empty>
        ) : (
          <Table head={["Time", "Flat", "Interval", "Litres", "Source"]}>
            {recent.map((r) => (
              <tr key={r.id}>
                <Td>{fmtDateTime(r.timestamp)}</Td>
                <Td>{labels.get(r.flatId) ?? r.flatId}</Td>
                <Td>{r.periodMinutes >= 1440 ? "day" : r.periodMinutes >= 60 ? "hour" : `${r.periodMinutes} min`}</Td>
                <Td>{r.litres.toLocaleString("en-IN")}</Td>
                <Td>
                  <Badge tone={r.source === "iot" ? "info" : "neutral"}>{r.source}</Badge>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
