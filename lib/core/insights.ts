import { round } from "./aggregate";
import type { DashboardSummary, SourceMonth } from "./summary";
import { monthCost } from "./summary";
import { monthLabel } from "./time";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const kl = (litres: number) => `${round(litres / 1000, 1).toLocaleString("en-IN")} kL`;
const pct = (a: number, b: number) => (b > 0 ? round(((a - b) / b) * 100) : 0);

function lastTwoComplete(d: DashboardSummary): [SourceMonth | undefined, SourceMonth | undefined] {
  const complete = d.monthly.filter((m) => m.month < d.currentMonth && m.consumedLitres > 0);
  return [complete[complete.length - 1], complete[complete.length - 2]];
}

/** Rule-based monthly summary: free, instant, and worked out from the dashboard numbers. */
export function ruleBasedSummary(d: DashboardSummary, openAlerts: string[] = []): string {
  const [last, prev] = lastTwoComplete(d);
  const parts: string[] = [];
  if (last) {
    const cost = monthCost(last);
    parts.push(`In ${monthLabel(last.month)} the society used ${kl(last.consumedLitres)} and spent ${inr(cost)} on water (${inr(cost > 0 && last.consumedLitres > 0 ? (cost / last.consumedLitres) * 1000 : 0)}/kL).`);
    if (prev) {
      const dl = pct(last.consumedLitres, prev.consumedLitres);
      const dc = pct(cost, monthCost(prev));
      const water = Math.abs(dl) < 1 ? "about the same water" : `${Math.abs(dl)}% ${dl > 0 ? "more" : "less"} water`;
      const spend = Math.abs(dc) < 1 ? "about the same cost" : `${Math.abs(dc)}% ${dc > 0 ? "higher" : "lower"} cost`;
      parts.push(`That is ${water} and ${spend} than ${monthLabel(prev.month)}.`);
    }
    if (last.tankerCount) {
      const share = cost > 0 ? round((last.tankerCost / cost) * 100) : 0;
      parts.push(`${last.tankerCount} tankers supplied ${kl(last.tankerLitres)} and made up ${share}% of the spend.`);
    }
  }
  const top = d.topFlats[0];
  if (top && top.vsAverage > 1.4) parts.push(`Highest user over the last 30 days: ${top.flatLabel} at ${top.vsAverage}x the building average.`);
  if (openAlerts.length) parts.push(`${openAlerts.length} open leak alert${openAlerts.length > 1 ? "s" : ""}: ${openAlerts.slice(0, 2).join(" ")}`);
  const f = d.forecast;
  if (f) parts.push(`Forecast for ${monthLabel(f.month)}: about ${kl(f.demandLitres)}, needing ~${f.tankers} tankers (${inr(f.tankerCost)}).${f.tankers > 0 ? " Book tankers early." : ""}`);
  return parts.join(" ") || "Not enough data yet. Add readings and supply entries to see a summary.";
}

/**
 * Keyword answers for "Ask your water data", worked out from the society's own numbers. Covers the questions
 * in the demo script; anything else gets the monthly summary.
 */
export function ruleBasedAnswer(question: string, d: DashboardSummary, openAlerts: string[] = []): string {
  const q = question.toLowerCase();
  const [last, prev] = lastTwoComplete(d);
  if (/(bill|cost|spend|expens|price).*(up|increase|high|more)|why.*(bill|cost)/.test(q) && last && prev) {
    const dc = monthCost(last) - monthCost(prev);
    const dTanker = last.tankerCost - prev.tankerCost;
    const dLitres = last.consumedLitres - prev.consumedLitres;
    const reasons: string[] = [];
    if (Math.abs(dTanker) > Math.abs(dc) * 0.4) reasons.push(`tanker spend changed by ${inr(dTanker)} (${prev.tankerCount} → ${last.tankerCount} tankers)`);
    if (Math.abs(dLitres) > 0) reasons.push(`consumption changed by ${kl(dLitres)}`);
    if (last.borewellLitres < prev.borewellLitres * 0.9) reasons.push(`borewell output fell ${kl(prev.borewellLitres - last.borewellLitres)}, so more water had to be bought`);
    if (openAlerts.length) reasons.push(`there ${openAlerts.length === 1 ? "is" : "are"} ${openAlerts.length} open leak alert(s) adding to usage`);
    return `Total water cost went from ${inr(monthCost(prev))} in ${monthLabel(prev.month)} to ${inr(monthCost(last))} in ${monthLabel(last.month)} (${dc >= 0 ? "+" : ""}${inr(dc)}). Main drivers: ${reasons.join("; ") || "no single driver stands out"}.`;
  }
  if (/sav|impact|worth|roi|pay for/.test(q)) {
    const im = d.impact;
    if (!im.leaksCaught) return "No leaks caught in the last 90 days yet. Each one AquaLedger catches is valued at tanker prices, the water you'd otherwise have to buy.";
    return `In the last 90 days AquaLedger caught leaks in ${im.leaksCaught} flat${im.leaksCaught > 1 ? "s" : ""} (${im.fixed} fixed, ${im.open} still open). Left running they would waste about ${kl(im.litresPerMonth)} a month, roughly ${inr(im.rupeesPerMonth)} at tanker prices (${inr(im.rupeesPerKl)}/kL). A 40-flat society pays ${inr(40 * 12)} a month for AquaLedger.`;
  }
  if (/leak|alert|waste|drip/.test(q)) {
    return openAlerts.length ? `Open alerts: ${openAlerts.join(" ")}` : "No open leak alerts right now. The nightly scan checks every flat for usage spikes and 2-4 a.m. flow.";
  }
  if (/tanker|forecast|next month|short|book/.test(q) && d.forecast) {
    const f = d.forecast;
    return `For ${monthLabel(f.month)} I expect demand of about ${kl(f.demandLitres)}. Municipal (${kl(f.municipalLitres)}) and borewell (${kl(f.borewellLitres)}) should cover part of it, leaving a ${kl(f.shortfallLitres)} gap: roughly ${f.tankers} tankers at ~${inr(f.tankerUnitCost)} each, ${inr(f.tankerCost)} in total.`;
  }
  if (/top|most|highest|which flat|who/.test(q)) {
    return `Top users over the last 30 days: ${d.topFlats.slice(0, 5).map((f) => `${f.flatLabel} (${kl(f.litres)}, ${f.vsAverage}x avg)`).join(", ")}.`;
  }
  if (/source|municipal|borewell|per kl|cheap/.test(q)) {
    return `Cost per kL by source: ${d.costPerKlBySource.map((s) => `${s.source} ${inr(s.costPerKl)}`).join(", ")}. Every kL saved is a kL of tanker water you don't buy.`;
  }
  return ruleBasedSummary(d, openAlerts);
}
