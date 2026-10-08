"use client";

import { useState } from "react";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

interface SliderProps {
  label: string;
  value: number;
  set: (v: number) => void;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}

function Slider({ label, value, set, min, max, step, fmt }: SliderProps) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-900">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-2 w-full accent-cyan-600" />
    </label>
  );
}

/**
 * Back-of-envelope ROI: every leak AquaLedger flags on day one instead of after a month saves
 * a month of wasted water, valued at what the society pays for tanker water.
 */
export default function SavingsCalculator() {
  const [flats, setFlats] = useState(300);
  const [leaks, setLeaks] = useState(30);
  const [days, setDays] = useState(45);
  const [price, setPrice] = useState(180);
  const LEAK_LITRES_PER_DAY = 480; // a running cistern, as in the demo society

  // AquaLedger flags a leak the next morning, so almost all of the days it would have run are saved
  const saved = leaks * LEAK_LITRES_PER_DAY * Math.max(days - 1, 0); // litres per year
  const savedRupees = (saved / 1000) * price;
  const cost = flats * 12 * 12;
  const multiple = cost > 0 ? savedRupees / cost : 0;

  return (
    <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 md:grid-cols-2">
      <div className="space-y-6 p-6 md:p-8">
        <Slider label="Flats in your society" value={flats} set={setFlats} min={20} max={1000} step={10} fmt={(v) => `${v}`} />
        <Slider label="Leaks a year (running cisterns, taps, pipes)" value={leaks} set={setLeaks} min={1} max={150} step={1} fmt={(v) => `${v}`} />
        <Slider label="How long a leak runs before anyone notices" value={days} set={setDays} min={7} max={120} step={1} fmt={(v) => `${v} days`} />
        <Slider label="What you pay for tanker water" value={price} set={setPrice} min={80} max={300} step={10} fmt={(v) => `${inr(v)}/kL`} />
        <p className="text-xs leading-relaxed text-slate-500">
          About 1 in 10 homes has a significant leak (US EPA WaterSense estimate), so a 300-flat society can expect ~30 a year. Each is assumed to waste ~{LEAK_LITRES_PER_DAY} L/day, like the
          running cistern in our demo society, until AquaLedger flags it the next morning. AquaLedger priced at ₹12 per flat per month.
        </p>
      </div>
      <div className="flex flex-col justify-center gap-5 bg-gradient-to-br from-cyan-600 to-teal-700 p-6 text-white md:p-8">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100">Water saved a year</div>
          <div className="text-3xl font-semibold">{Math.round(saved / 1000).toLocaleString("en-IN")} kL</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100">Money saved a year</div>
          <div className="text-4xl font-semibold">{inr(savedRupees)}</div>
        </div>
        <div className="rounded-xl bg-white/10 p-4 text-sm">
          AquaLedger costs {inr(cost)} a year.{" "}
          {multiple >= 1 ? (
            <b>Leak savings alone cover it {multiple.toFixed(1)}×,</b>
          ) : (
            <b>Leak savings cover {Math.round(multiple * 100)}% of it,</b>
          )}{" "}
          before fairer bills and better tanker planning.
        </div>
      </div>
    </div>
  );
}
