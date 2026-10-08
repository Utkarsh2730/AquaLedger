import Link from "next/link";

const FEATURES = [
  { icon: "🚨", title: "Catch leaks automatically", body: "Nightly scans flag usage spikes and steady 2-4 a.m. flow. Live meters alert the committee by email within seconds." },
  { icon: "🧾", title: "Fair, usage-based bills", body: "Every flat pays for the litres it actually used, plus a small common-area charge. No more equal-split disputes." },
  { icon: "🚚", title: "No more dry sumps", body: "Forecast next month's demand, tanker count and cost from your own history and the season. Book tankers early." },
  { icon: "📊", title: "Every litre, every rupee", body: "Municipal, borewell and tanker supply side by side, with cost per kL by source and the flats driving demand." },
  { icon: "✨", title: "Ask your water data", body: "“Why did our bill go up?” Get a plain-English answer and a monthly summary for the committee." },
  { icon: "🏠", title: "Resident portal", body: "Residents see their own usage against the building average and their bills. Nothing else." },
];

const TIERS = [
  { name: "Starter", price: "₹10", unit: "per flat / month", features: ["Up to 150 flats", "Manual + CSV readings", "Usage-based billing", "Leak alerts by email"] },
  { name: "Society", price: "₹12", unit: "per flat / month", features: ["Up to 600 flats", "Smart-meter live alerts", "Shortage forecasts", "Resident portal"], highlight: true },
  { name: "Township", price: "₹15", unit: "per flat / month", features: ["Unlimited flats", "AI summaries & chat", "Multiple admins", "Priority support"] },
];

export default function Landing() {
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-4 md:p-6">
        <span className="text-xl font-semibold text-brand-700">💧 AquaLedger</span>
        <nav className="flex items-center gap-3 text-sm">
          <a href="#pricing" className="hidden text-slate-600 hover:text-slate-900 sm:block">
            Pricing
          </a>
          <Link href="/resident" className="text-slate-600 hover:text-slate-900">
            Resident login
          </Link>
          <Link href="/login" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">
            Committee login
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 md:px-6 md:pt-20">
        <p className="mb-4 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">For apartment societies & RWAs</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
          Stop paying tanker prices for <span className="text-brand-600">someone else’s leak.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600">
          AquaLedger tracks every litre from municipal supply, borewells and tankers, catches leaks automatically, bills each flat by actual usage, and forecasts shortages before the
          sump runs dry.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className="rounded-lg bg-brand-600 px-5 py-3 font-medium text-white hover:bg-brand-700">
            Set up your society free →
          </Link>
          <a href="#how" className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-50">
            How it works
          </a>
        </div>
        <p className="mt-4 text-sm text-slate-500">It pays for itself if it catches one leak.</p>
      </section>

      <section className="bg-slate-50 py-16">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-3 md:px-6">
          {[
            ["3 sources", "Municipal, borewell and tankers. Most societies only know what tankers cost."],
            ["Equal split", "is how most committees divide the water bill, so a leaking flat pays the same as everyone."],
            ["Weeks", "is how long a running cistern goes unnoticed, at ₹150-220 per kL of tanker water."],
          ].map(([h, b]) => (
            <div key={h}>
              <div className="text-2xl font-semibold text-slate-900">{h}</div>
              <p className="mt-2 text-slate-600">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">Everything the committee needs</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 p-6">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Simple per-flat pricing</h2>
          <p className="mt-2 text-slate-600">A 300-flat society pays about ₹4,000 a month: less than two summer tankers.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {TIERS.map((t) => (
              <div key={t.name} className={`rounded-xl border bg-white p-6 ${t.highlight ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200"}`}>
                <h3 className="font-semibold">{t.name}</h3>
                <div className="mt-3">
                  <span className="text-4xl font-semibold">{t.price}</span> <span className="text-sm text-slate-500">{t.unit}</span>
                </div>
                <ul className="mt-6 space-y-2 text-sm text-slate-600">
                  {t.features.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
                <Link href="/login" className={`mt-6 block rounded-lg px-4 py-2 text-center text-sm font-medium ${t.highlight ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-700"}`}>
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl p-6 text-sm text-slate-500">Built on AWS serverless · © AquaLedger</footer>
    </div>
  );
}
