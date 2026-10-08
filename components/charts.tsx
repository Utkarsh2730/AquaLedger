"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { monthLabel } from "@/lib/core/time";

const C = { municipal: "#0891b2", borewell: "#65a30d", tanker: "#f59e0b", consumed: "#0f172a", flat: "#0891b2", avg: "#94a3b8" };
const klTick = (v: number) => `${Math.round(v / 1000)} kL`;
const dayTick = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
// smaller legend and tooltip that match the rest of the UI (Recharts defaults are 16px)
const legend = { wrapperStyle: { fontSize: 12, paddingTop: 8 }, iconType: "circle" as const, iconSize: 8 };
const tooltip = {
  contentStyle: { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,0.08)", fontSize: 12 },
  cursor: { fill: "rgba(148,163,184,0.12)" },
};
const axis = { fontSize: 12, tickLine: false, axisLine: false, stroke: "#94a3b8" };
const short = (m: string) => monthLabel(m).replace(/ 20/, " '");
/** the current month is only partly metered: say so instead of letting it look like a collapse */
const monthTick = (current?: string) => (m: string) => (m === current ? `${short(m)} (so far)` : short(m));

export function SourceMixChart({ data, currentMonth }: { data: { month: string; municipalLitres: number; borewellLitres: number; tankerLitres: number; consumedLitres: number }[]; currentMonth?: string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data}>
        <CartesianGrid stroke="#eef2f6" vertical={false} />
        <XAxis {...axis} dataKey="month" tickFormatter={monthTick(currentMonth)}/>
        <YAxis {...axis} tickFormatter={klTick} width={60} />
        <Tooltip {...tooltip} formatter={(v) => `${Math.round(Number(v) / 1000).toLocaleString("en-IN")} kL`} labelFormatter={(m) => monthLabel(String(m))} />
        <Legend {...legend} />
        <Bar dataKey="municipalLitres" name="Municipal" stackId="s" fill={C.municipal} />
        <Bar dataKey="borewellLitres" name="Borewell" stackId="s" fill={C.borewell} />
        <Bar dataKey="tankerLitres" name="Tanker" stackId="s" fill={C.tanker} radius={[4, 4, 0, 0]} />
        <Line dataKey="consumedLitres" name="Metered use" stroke={C.consumed} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function CostChart({ data, currentMonth }: { data: { month: string; municipalCost: number; borewellCost: number; tankerCost: number }[]; currentMonth?: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid stroke="#eef2f6" vertical={false} />
        <XAxis {...axis} dataKey="month" tickFormatter={monthTick(currentMonth)}/>
        <YAxis {...axis} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} width={48} />
        <Tooltip {...tooltip} formatter={(v) => `₹${Math.round(Number(v)).toLocaleString("en-IN")}`} labelFormatter={(m) => monthLabel(String(m))} />
        <Legend {...legend} />
        <Bar dataKey="municipalCost" name="Municipal" stackId="c" fill={C.municipal} />
        <Bar dataKey="borewellCost" name="Borewell power" stackId="c" fill={C.borewell} />
        <Bar dataKey="tankerCost" name="Tankers" stackId="c" fill={C.tanker} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DailyTrendChart({ data, height = 220 }: { data: { day: string; litres: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.municipal} stopOpacity={0.35} />
            <stop offset="100%" stopColor={C.municipal} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#eef2f6" vertical={false} />
        <XAxis {...axis} dataKey="day" tickFormatter={dayTick} minTickGap={28} />
        <YAxis {...axis} tickFormatter={klTick} width={60} />
        <Tooltip {...tooltip} formatter={(v) => `${Math.round(Number(v)).toLocaleString("en-IN")} L`} labelFormatter={(d) => dayTick(String(d))} />
        <Area dataKey="litres" name="Daily use" stroke={C.municipal} fill="url(#trend)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function FlatVsAverageChart({ data, xKey, xFormat }: { data: { litres: number; buildingAvg: number }[]; xKey: string; xFormat?: (v: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid stroke="#eef2f6" vertical={false} />
        <XAxis {...axis} dataKey={xKey} tickFormatter={xFormat} minTickGap={20} />
        <YAxis {...axis} width={48} tickFormatter={(v) => (v >= 10_000 ? klTick(v) : String(v))} />
        <Tooltip {...tooltip} formatter={(v) => `${Math.round(Number(v)).toLocaleString("en-IN")} L`} />
        <Legend {...legend} />
        <Line dataKey="litres" name="This flat" stroke={C.flat} strokeWidth={2} dot={false} />
        <Line dataKey="buildingAvg" name="Building average" stroke={C.avg} strokeDasharray="4 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LiveChart({ data }: { data: { t: string; litres: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid stroke="#eef2f6" vertical={false} />
        <XAxis {...axis} dataKey="t"  minTickGap={20} />
        <YAxis {...axis} width={36} />
        <Tooltip {...tooltip} formatter={(v) => `${Number(v).toFixed(1)} L/min`} />
        <Bar dataKey="litres" name="Flow (L/min)" fill={C.municipal} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
