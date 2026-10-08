/**
 * Illustration of an apartment society and its three water sources, with a leak caught in
 * flat B-202. Pure SVG (no image download); animations respect prefers-reduced-motion.
 */
export default function SocietyScene({ className = "" }: { className?: string }) {
  const cols = [218, 262, 306, 350];
  const rows = [144, 188, 232, 276, 320];
  const lit = new Set(["0-2", "1-0", "1-3", "2-1", "3-3", "4-0", "4-2", "0-0"]);
  return (
    <svg viewBox="14 40 576 360" className={className} role="img" aria-label="An apartment block fed by municipal supply, a borewell and a tanker, with a leak flagged in flat B-202">
      <defs>
        <radialGradient id="al-sky" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#cffafe" />
          <stop offset="100%" stopColor="#ecfeff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="al-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
        <linearGradient id="al-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </linearGradient>
        <filter id="al-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.12" />
        </filter>
      </defs>

      <circle cx="300" cy="230" r="215" fill="url(#al-sky)" />
      <ellipse cx="300" cy="390" rx="270" ry="14" fill="#0f172a" opacity="0.06" />
      <rect x="20" y="384" width="560" height="4" rx="2" fill="#cbd5e1" />

      {/* municipal supply */}
      <path d="M30 300 H200" stroke="#0891b2" strokeWidth="7" strokeLinecap="round" />
      <path d="M30 300 H200" stroke="#a5f3fc" strokeWidth="2" strokeDasharray="6 10" className="al-flow" />
      <text x="40" y="288" fontSize="14" fontWeight="600" fill="#0e7490">Municipal</text>

      {/* borewell */}
      <path d="M136 372 H200" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
      <rect x="114" y="326" width="8" height="26" fill="#94a3b8" />
      <rect x="100" y="350" width="36" height="34" rx="5" fill="#65a30d" />
      <rect x="106" y="358" width="24" height="5" rx="2" fill="#bef264" />
      <text x="118" y="318" fontSize="14" fontWeight="600" fill="#4d7c0f" textAnchor="middle">Borewell</text>

      {/* building */}
      <g filter="url(#al-shadow)">
        <rect x="200" y="126" width="200" height="260" rx="6" fill="url(#al-wall)" stroke="#cbd5e1" strokeWidth="2" />
      </g>
      <rect x="192" y="118" width="216" height="12" rx="3" fill="#e2e8f0" />
      {rows.map((y, r) =>
        cols.map((x, c) => {
          const leak = r === 3 && c === 1;
          return (
            <rect
              key={`${r}-${c}`}
              x={x}
              y={y}
              width="32"
              height="26"
              rx="3"
              fill={leak ? "#ffe4e6" : lit.has(`${r}-${c}`) ? "#fef3c7" : "#e0f2fe"}
              stroke={leak ? "#f43f5e" : "#cbd5e1"}
              strokeWidth={leak ? 2 : 1}
            />
          );
        })
      )}
      <rect x="280" y="350" width="40" height="36" rx="3" fill="#cbd5e1" />
      <circle cx="312" cy="369" r="2" fill="#64748b" />

      {/* overhead tank */}
      <path d="M268 118 V108 M332 118 V108" stroke="#94a3b8" strokeWidth="4" />
      <rect x="255" y="62" width="90" height="48" rx="9" fill="#ecfeff" stroke="#0891b2" strokeWidth="2" />
      <rect x="259" y="80" width="82" height="26" rx="6" fill="url(#al-water)" />
      <text x="300" y="54" fontSize="13" fill="#64748b" textAnchor="middle">Overhead tank · 68%</text>

      {/* leak in B-202 */}
      <circle cx="278" cy="289" r="20" fill="none" stroke="#f43f5e" strokeWidth="2" className="al-pulse" />
      {[0, 0.6, 1.2].map((d) => (
        <path key={d} d="M278 306 q-3 5 0 8 q3 -3 0 -8z" fill="#0891b2" className="al-drip" style={{ animationDelay: `${d}s` }} />
      ))}
      <path d="M196 214 L262 284" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="4 4" />
      <g filter="url(#al-shadow)" className="al-float">
        <rect x="18" y="164" width="178" height="66" rx="10" fill="#ffffff" />
        <circle cx="38" cy="186" r="9" fill="#ffe4e6" />
        <path d="M38 181 v6 M38 190.5 v.5" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" />
        <text x="54" y="186" fontSize="14" fontWeight="700" fill="#0f172a">Leak · Flat B-202</text>
        <text x="54" y="204" fontSize="13" fill="#e11d48">481 L/day at 2-4 a.m.</text>
        <text x="54" y="220" fontSize="12" fill="#64748b">Committee emailed</text>
      </g>

      {/* tanker */}
      <path d="M420 374 H400" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" />
      <rect x="420" y="326" width="100" height="42" rx="21" fill="#f59e0b" />
      <text x="470" y="352" fontSize="14" fontWeight="800" fill="#ffffff" textAnchor="middle" letterSpacing="2">WATER</text>
      <rect x="520" y="332" width="46" height="38" rx="7" fill="#0e7490" />
      <rect x="528" y="339" width="28" height="14" rx="3" fill="#cffafe" />
      <rect x="416" y="366" width="152" height="8" rx="3" fill="#334155" />
      {[446, 498, 546].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="376" r="10" fill="#1e293b" />
          <circle cx={cx} cy="376" r="4" fill="#94a3b8" />
        </g>
      ))}
      <text x="492" y="316" fontSize="14" fontWeight="600" fill="#b45309" textAnchor="middle">Tanker · ₹186/kL</text>

      {/* live meter card */}
      <path d="M418 222 L400 236" stroke="#0891b2" strokeWidth="1.5" strokeDasharray="4 4" />
      <g filter="url(#al-shadow)" className="al-float" style={{ animationDelay: "1.5s" }}>
        <rect x="410" y="146" width="176" height="78" rx="10" fill="#ffffff" />
        <text x="430" y="172" fontSize="14" fontWeight="700" fill="#0f172a">Live meter · C-301</text>
        <text x="430" y="188" fontSize="12" fill="#64748b">litres per minute</text>
        {[3, 2, 4, 2, 3, 2, 13, 14, 13].map((h, i) => (
          <rect key={i} x={430 + i * 15} y={212 - h * 1.4} width="10" height={h * 1.4} rx="2" fill={h > 8 ? "#f43f5e" : "#22d3ee"} />
        ))}
      </g>
    </svg>
  );
}
