"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { client, inr, kl, listAll, unwrap } from "@/lib/client";
import type { Schema } from "@/amplify/data/resource";
import type { DashboardSummary } from "@/lib/core/summary";
import { monthLabel } from "@/lib/core/time";
import { useSociety } from "@/components/SocietyContext";
import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, Spinner, Stat } from "@/components/ui";
import { ChatIcon } from "@/components/icons";

type Insight = Schema["Insight"]["type"];
interface Msg {
  role: "user" | "assistant";
  text: string;
  source?: string;
}

const SUGGESTIONS = ["Why did our bill go up this month?", "How many tankers do we need next month?", "Which flats use the most water?", "Are there any leaks?"];

export default function InsightsPage() {
  const { societyId } = useSociety();
  const [dash, setDash] = useState<DashboardSummary | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [generating, setGenerating] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [d, i] = await Promise.all([
        client.queries.getDashboard({ societyId }),
        listAll<Insight>((nextToken) => client.models.Insight.listInsightsBySociety({ societyId }, { sortDirection: "DESC", limit: 12, nextToken }), 12),
      ]);
      setDash(unwrap<{ dashboard: DashboardSummary }>(d).dashboard);
      setInsights(i);
    } catch (err) {
      setError(err);
    }
  }, [societyId]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  async function generate() {
    setGenerating(true);
    try {
      unwrap(await client.mutations.runAnalysis({ societyId, task: "insights" }));
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setGenerating(false);
    }
  }

  async function ask(q: string) {
    if (!q.trim()) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    setAsking(true);
    try {
      const res = unwrap<{ answer: string; source: string }>(await client.queries.askWaterData({ societyId, question: q }));
      setMessages((m) => [...m, { role: "assistant", text: res.answer, source: res.source }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: err instanceof Error ? err.message : "Something went wrong" }]);
    } finally {
      setAsking(false);
    }
  }

  const f = dash?.forecast;
  return (
    <div className="space-y-6">
      <PageHeader title="Forecast & insights" subtitle="Plan tankers before the sump runs dry, and ask your water data questions in plain English." />
      <ErrorBox error={error} />
      {!dash ? (
        <Spinner />
      ) : f ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label={`Demand · ${monthLabel(f.month)}`} value={kl(f.demandLitres)} hint={`seasonal factor ×${f.seasonalFactor}`} />
            <Stat label="Expected own supply" value={kl(f.municipalLitres + f.borewellLitres)} hint={`${kl(f.municipalLitres)} municipal · ${kl(f.borewellLitres)} borewell`} />
            <Stat label="Tankers to book" value={f.tankers} tone={f.tankers > 0 ? "bad" : "good"} hint={`${kl(f.shortfallLitres)} shortfall · ${kl(f.tankerLitres, 0)} each`} />
            <Stat label="Tanker budget" value={inr(f.tankerCost)} hint={`~${inr(f.tankerUnitCost)} per tanker`} />
          </div>
          <p className="text-xs text-slate-500">
            Method: 3-month moving average of de-seasonalised use ({f.basisMonths.map(monthLabel).join(", ")}) × the seasonal factor for {monthLabel(f.month)}; borewell yield is adjusted
            for the season; tankers cover the gap.
          </p>
        </>
      ) : (
        <Empty>Forecast needs at least one complete month of readings.</Empty>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><ChatIcon width={18} height={18} className="text-brand-600" /> Ask your water data</span>}>
          <div className="flex h-96 flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {messages.length === 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-slate-500">Try one of these:</p>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => ask(s)} className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : ""}>
                  <div className={`inline-block max-w-[90%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                    {m.text}
                  </div>
                  {m.source && (
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      worked out from your society's data
                    </div>
                  )}
                </div>
              ))}
              {asking && <div className="text-sm text-slate-400">Thinking…</div>}
              <div ref={endRef} />
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                ask(question);
              }}
            >
              <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Why did our bill go up this month?" />
              <Button type="submit" disabled={asking}>
                Ask
              </Button>
            </form>
          </div>
        </Card>
        <Card
          title="Monthly summaries"
          action={
            <Button variant="secondary" onClick={generate} disabled={generating}>
              {generating ? "Writing…" : "Generate for last month"}
            </Button>
          }
        >
          {insights.length === 0 ? (
            <Empty>No summaries yet. They are written automatically on the 1st of every month.</Empty>
          ) : (
            <div className="space-y-4">
              {insights.map((i) => (
                <div key={i.id}>
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                    {monthLabel(i.month)} <Badge tone="info">auto</Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">{i.summaryText}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
