"use client";

import { formatAccessCode } from "@/lib/core/access";

/** One flat's new login, for the committee's code sheet (shown once; only hashes are stored). */
export interface AccessRow {
  flat: string;
  code: string;
  link: string;
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function downloadAccessCsv(rows: AccessRow[], societyName: string) {
  const csv = ["Flat,Access code,Link", ...rows.map((r) => [r.flat, formatAccessCode(r.code), r.link].map(csvCell).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${societyName.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "society"}-resident-access-codes.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Opens a print-ready page of cut-out slips, one per flat, for letterboxes or the notice desk. */
export function printAccessSlips(rows: AccessRow[], societyName: string, portalUrl: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  const slips = rows
    .map(
      (r) => `<div class="slip">
  <div class="top"><span>💧 AquaLedger · ${esc(societyName)}</span><b>Flat ${esc(r.flat)}</b></div>
  <div class="label">Your flat's access code</div>
  <div class="code">${esc(formatAccessCode(r.code))}</div>
  <div class="how">Open <b>${esc(portalUrl)}</b> and enter the code to see your water use and bills. No password needed. Keep it within your household.</div>
</div>`
    )
    .join("\n");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Resident access codes · ${esc(societyName)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 16px; color: #0f172a; }
  .bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .bar button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; background: #059669; color: #fff; cursor: pointer; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .slip { border: 1px dashed #94a3b8; padding: 14px 16px; break-inside: avoid; }
  .top { display: flex; justify-content: space-between; font-size: 12px; color: #475569; }
  .top b { color: #0f172a; font-size: 14px; }
  .label { margin-top: 10px; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .code { font-family: Menlo, Consolas, monospace; font-size: 22px; font-weight: 700; letter-spacing: 3px; margin: 2px 0 8px; }
  .how { font-size: 11px; color: #334155; line-height: 1.4; }
  @media print { .bar { display: none; } body { margin: 0; } }
</style></head><body>
<div class="bar"><div><b>${rows.length} access codes</b> · ${esc(societyName)} · cut along the dashed lines</div><button onclick="print()">Print</button></div>
<div class="grid">${slips}</div>
<script>setTimeout(() => print(), 300)</script>
</body></html>`);
  w.document.close();
  return true;
}
