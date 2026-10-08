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
const klTick = (v: number) => `${Math.round(v / 1000)}k`;
const short = (m: string) => monthLabel(m).replace(/ 20/, " '");

export function SourceMixChart({ data }: { data: { month: string; municipalLitres: number; borewellLitres: number; tankerLitres: number; consumedLitres: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={short} fontSize={12} />
        <YAxis tickFormatter={klTick} fontSize={12} width={40} />
        <Tooltip formatter={(v) => `${Math.round(Number(v) / 1000).toLocaleString("en-IN")} kL`} labelFormatter={(m) => monthLabel(String(m))} />
        <Legend />
        <Bar dataKey="municipalLitres" name="Municipal" stackId="s" fill={C.municipal} />
        <Bar dataKey="borewellLitres" name="Borewell" stackId="s" fill={C.borewell} />
        <Bar dataKey="tankerLitres" name="Tanker" stackId="s" fill={C.tanker} radius={[4, 4, 0, 0]} />
        <Line dataKey="consumedLitres" name="Metered use" stroke={C.consumed} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function CostChart({ data }: { data: { month: string; municipalCost: number; borewellCost: number; tankerCost: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickFormatter={short} fontSize={12} />
        <YAxis tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} fontSize={12} width={48} />
        <Tooltip formatter={(v) => `₹${Math.round(Number(v)).toLocaleString("en-IN")}`} labelFormatter={(m) => monthLabel(String(m))} />
        <Legend />
        <Bar dataKey="municipalCost" name="Municipal" stackId="c" fill={C.municipal} />
        <Bar dataKey="borewellCost" name="Borewell power" stackId="c" fill={C.borewell} />
        <Bar dataKey="tankerCost" name="Tankers" stackId="c" fill={C.tanker} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DailyTrendChart({ data }: { data: { day: string; litres: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.municipal} stopOpacity={0.35} />
            <stop offset="100%" stopColor={C.municipal} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={(d) => String(d).slice(5)} fontSize={12} minTickGap={20} />
        <YAxis tickFormatter={klTick} fontSize={12} width={40} />
        <Tooltip formatter={(v) => `${Math.round(Number(v)).toLocaleString("en-IN")} L`} />
        <Area dataKey="litres" name="Daily use" stroke={C.municipal} fill="url(#trend)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function FlatVsAverageChart({ data, xKey, xFormat }: { data: { litres: number; buildingAvg: number }[]; xKey: string; xFormat?: (v: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} tickFormatter={xFormat} fontSize={12} minTickGap={20} />
        <YAxis fontSize={12} width={48} tickFormatter={(v) => (v >= 10_000 ? klTick(v) : String(v))} />
        <Tooltip formatter={(v) => `${Math.round(Number(v)).toLocaleString("en-IN")} L`} />
        <Legend />
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
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="t" fontSize={11} minTickGap={20} />
        <YAxis fontSize={12} width={36} />
        <Tooltip formatter={(v) => `${Number(v).toFixed(1)} L/min`} />
        <Bar dataKey="litres" name="Flow (L/min)" fill={C.municipal} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
