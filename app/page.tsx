import Link from "next/link";
import BrowserFrame from "@/components/landing/BrowserFrame";
import SocietyScene from "@/components/landing/SocietyScene";
import SavingsCalculator from "@/components/landing/SavingsCalculator";
import TourVideo from "@/components/landing/TourVideo";
import { AlertIcon, BuildingIcon, CheckIcon, DropIcon, GaugeIcon, HomeIcon, ReceiptIcon, SparkIcon, TruckIcon } from "@/components/landing/Icons";

const STEPS = [
  { icon: GaugeIcon, title: "Meter every litre", body: "Type readings in, upload the CSV your meter reader sends, or connect smart meters for live data." },
  { icon: AlertIcon, title: "Catch leaks overnight", body: "Every night each flat is checked for usage spikes and steady 2-4 a.m. flow. Live meters alert in seconds." },
  { icon: ReceiptIcon, title: "Bill by actual use", body: "Each flat pays its share of metered litres plus a small common charge. One click, printable bills." },
  { icon: TruckIcon, title: "Plan tankers early", body: "Next month's demand, tanker count and budget from your history and the season." },
];

const SHOWCASE = [
  {
    tag: "Leak detection",
    title: "Find the running cistern before it costs a month of tanker water",
    body: "AquaLedger compares every flat with its own normal and watches for water flowing while everyone sleeps. The committee gets an email with the flat, the pattern and the litres being wasted.",
    points: ["Usage spikes over 2.5σ above a flat's normal", "Steady flow between 2 and 4 a.m. on 3+ nights", "Live alerts within seconds from smart meters"],
    img: "/screens/alerts.jpg",
    alt: "Leak alerts page flagging flat B-202",
  },
  {
    tag: "Fair billing",
    title: "End the equal-split argument at the AGM",
    body: "The society's real water cost (municipal supply, borewell power and every tanker) is shared by metered litres. Small households stop paying for the garden-hose flat.",
    points: ["Each flat's share of the litres, side by side", "Shows what every flat paid under the old equal split", "Printable bills, CSV export for your accounts"],
    img: "/screens/bills.jpg",
    alt: "Usage-based bills compared with the old equal split",
  },
  {
    tag: "Forecast & insights",
    title: "Know how many tankers you'll need before summer hits",
    body: "A seasonal forecast tells you next month's demand and tanker budget. Ask questions in plain English: why did the bill go up, which flats use the most, how much did leak detection save.",
    points: ["3-month moving average × seasonal factor", "Monthly summary written for the committee", "Plain-English answers from your own data"],
    img: "/screens/insights.jpg",
    alt: "Forecast and chat with plain-English answers",
  },
  {
    tag: "Live meters",
    title: "Watch a burst pipe show up in real time",
    body: "Smart meters (or the included simulator) stream readings every few seconds. Abnormal flow raises an alert and emails the committee straight away.",
    points: ["Works with any meter that can send an HTTPS request", "Per-society device tokens", "Python simulator included for demos"],
    img: "/screens/live.jpg",
    alt: "Live meter chart with an abnormal-flow alert",
  },
];

const TIERS = [
  { name: "Starter", price: "₹10", features: ["Up to 150 flats", "Manual + CSV readings", "Usage-based billing", "Leak alerts by email"] },
  { name: "Society", price: "₹12", features: ["Up to 600 flats", "Smart-meter live alerts", "Shortage forecasts", "Resident portal"], highlight: true },
  { name: "Township", price: "₹15", features: ["Unlimited flats", "Monthly summaries & Q&A", "Multiple committee admins", "Priority support"] },
];

const FAQ = [
  { q: "Do we need smart meters?", a: "No. Most societies start with the readings they already take: type them in or upload a CSV. Smart meters add live leak alerts, and you can add them flat by flat." },
  { q: "What can residents see?", a: "Only their own flat: their usage against the building average, and their bills once the committee issues them. Never another flat's data." },
  { q: "How long does setup take?", a: "About a minute: create the society, add blocks and flats, and log your water sources. You can load six months of demo data first to see everything working." },
  { q: "Where is our data stored?", a: "On AWS in the Mumbai region, in a fully serverless setup. Each society's data is isolated by its own access group." },
  { q: "What if a reading is wrong?", a: "Bills stay drafts until the committee issues them, and re-running the bill run never touches bills you've already issued or marked paid." },
];

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800 ring-1 ring-cyan-100">{children}</span>;
}

export default function Landing() {
  return (
    <div className="bg-white text-slate-900">
      {/* nav */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:px-4 md:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-1.5 text-base font-semibold text-brand-700 sm:gap-2 sm:text-lg">
            <DropIcon className="h-6 w-6 fill-cyan-500 stroke-cyan-600" />
            <span className="max-[379px]:sr-only">AquaLedger</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-4">
            <TourVideo />
            <a href="#how" className="hidden px-2 text-slate-600 hover:text-slate-900 lg:block">How it works</a>
            <a href="#features" className="hidden px-2 text-slate-600 hover:text-slate-900 lg:block">Features</a>
            <a href="#pricing" className="hidden px-2 text-slate-600 hover:text-slate-900 lg:block">Pricing</a>
            {/* two doors, one control: green for residents (matches the resident portal), cyan for the committee */}
            <div role="group" aria-label="Log in" className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              <Link
                href="/resident"
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-medium text-emerald-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:px-4"
              >
                <HomeIcon className="hidden h-4 w-4 min-[400px]:block" />
                <span>
                  Resident
                  <span className="hidden sm:inline"> login</span>
                </span>
              </Link>
              <Link
                href="/login"
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand-600 px-2.5 font-medium text-white shadow-sm shadow-cyan-700/20 transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:px-4"
              >
                <BuildingIcon className="hidden h-4 w-4 min-[400px]:block" />
                <span>
                  Committee
                  <span className="hidden sm:inline"> login</span>
                </span>
              </Link>
            </div>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_75%_10%,#cffafe_0%,transparent_70%),radial-gradient(40%_40%_at_0%_100%,#ecfdf5_0%,transparent_70%)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-12 md:px-6 lg:grid-cols-[1fr_1.1fr] lg:pb-20 lg:pt-20">
          <div>
            <Pill>💧 For apartment societies, RWAs and facility managers</Pill>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
              Stop paying tanker prices for <span className="bg-gradient-to-r from-cyan-600 to-teal-500 bg-clip-text text-transparent">someone else’s leak.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              AquaLedger tracks every litre from municipal supply, borewells and tankers, catches leaks automatically, bills each flat by actual usage and forecasts shortages
              before the sump runs dry.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="rounded-xl bg-brand-600 px-6 py-3 font-medium text-white shadow-lg shadow-cyan-600/20 hover:bg-brand-700">
                Set up your society →
              </Link>
              <a href="#how" className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-medium text-slate-700 hover:bg-slate-50">
                See how it works
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              {["Set up in a minute", "Works with manual readings", "Pays for itself with one leak"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckIcon className="h-4 w-4 text-emerald-600" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <SocietyScene className="w-full" />
          </div>
        </div>
      </section>

      {/* product preview */}
      <section className="relative px-4 md:px-6">
        <div className="relative mx-auto max-w-5xl">
          <BrowserFrame src="/screens/dashboard.jpg" alt="AquaLedger dashboard: water by source, cost per kL, leak impact and forecast" />
          <div className="al-float absolute -left-24 top-[42%] hidden w-60 rounded-xl border border-rose-100 bg-white p-4 shadow-xl xl:block">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
              <AlertIcon className="h-4 w-4" /> Leak caught
            </div>
            <p className="mt-1 text-sm text-slate-700">B-202: steady flow at 2-4 a.m., ~481 L/day.</p>
          </div>
          <div className="al-float absolute -right-24 bottom-16 hidden w-64 rounded-xl border border-emerald-100 bg-white p-4 shadow-xl xl:block" style={{ animationDelay: "2s" }}>
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <ReceiptIcon className="h-4 w-4" /> Fair bill
            </div>
            <p className="mt-1 text-sm text-slate-700">
              D-401 pays <b>₹271</b> instead of the ₹551 equal split.
            </p>
          </div>
        </div>
      </section>

      {/* stats band */}
      <section className="mt-16 bg-slate-950 py-14 text-white">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <p className="text-center text-sm text-slate-400">From six months of data in our 40-flat demo society</p>
          <div className="mt-8 grid grid-cols-2 gap-8 text-center md:grid-cols-4">
            {[
              ["8×", "tanker water costs this much more than municipal supply"],
              ["₹2,700", "a month wasted by one running cistern, at tanker prices"],
              ["19 of 40", "flats pay less with usage-based bills"],
              ["Seconds", "from an open tap to a live alert, then an email to the committee"],
            ].map(([n, l]) => (
              <div key={n}>
                <div className="bg-gradient-to-b from-cyan-200 to-cyan-400 bg-clip-text text-4xl font-semibold text-transparent lg:text-5xl">{n}</div>
                <p className="mx-auto mt-2 max-w-[14rem] text-sm text-slate-400">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* problem */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Three sources of water. One bill split equally. Nobody sees the leak.</h2>
          <div className="mt-8 space-y-5">
            {[
              ["🚰", "Municipal supply is rationed", "and borewells run low every summer, so societies buy tankers at 5-10× the price."],
              ["🧾", "The bill is split equally", "so the flat with a leaking cistern pays the same as a retired couple. That's the argument at every AGM."],
              ["🌙", "Leaks run for weeks", "because nobody is watching the meters at 3 a.m. Every litre lost is bought back at tanker prices."],
            ].map(([e, h, b]) => (
              <div key={h} className="flex gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">{e}</div>
                <p className="text-slate-600">
                  <b className="text-slate-900">{h}</b> {b}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-slate-50 to-cyan-50 p-6 ring-1 ring-slate-100">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Municipal", price: "₹22/kL", color: "bg-cyan-600", h: "h-10" },
              { label: "Borewell", price: "₹9/kL", color: "bg-lime-600", h: "h-6" },
              { label: "Tanker", price: "₹186/kL", color: "bg-amber-500", h: "h-48" },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center justify-end">
                <div className="text-lg font-semibold">{s.price}</div>
                <div className={`mt-2 w-full max-w-20 rounded-t-lg ${s.color} ${s.h}`} />
                <div className="mt-2 text-sm text-slate-600">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">Cost per kilolitre by source in the demo society. A leak is paid for at the tanker price.</p>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="scroll-mt-20 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">How it works</h2>
            <p className="mt-3 text-slate-600">From meter reading to fair bill, without spreadsheets.</p>
          </div>
          <div className="relative mt-14 grid gap-6 md:grid-cols-4">
            <div className="absolute left-[12%] right-[12%] top-7 hidden h-0.5 bg-gradient-to-r from-cyan-200 via-cyan-400 to-teal-300 md:block" />
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative text-center">
                <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-md ring-1 ring-cyan-100">
                  <s.icon className="h-7 w-7" />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-xs font-semibold text-white">{i + 1}</span>
                </div>
                <h3 className="mt-5 font-semibold">{s.title}</h3>
                <p className="mx-auto mt-2 max-w-[15rem] text-sm text-slate-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* feature showcase */}
      <section id="features" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl space-y-24 px-4 md:px-6">
          {SHOWCASE.map((f, i) => (
            <div key={f.tag} className={`grid items-center gap-10 lg:grid-cols-2 ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
              <div>
                <Pill>{f.tag}</Pill>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">{f.title}</h3>
                <p className="mt-4 text-slate-600">{f.body}</p>
                <ul className="mt-6 space-y-2">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" /> {p}
                    </li>
                  ))}
                </ul>
              </div>
              <BrowserFrame src={f.img} alt={f.alt} />
            </div>
          ))}
        </div>
      </section>

      {/* before / after */}
      <section className="bg-gradient-to-b from-white to-cyan-50/60 py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Same water bill. Fairly shared.</h2>
            <p className="mt-3 text-slate-600">September in the demo society: ₹16,041 of water for 40 flats.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="text-sm font-semibold text-slate-500">Before · equal split</div>
              <div className="mt-4 space-y-3">
                {["D-202 · heaviest user", "C-301 · typical flat", "D-401 · lightest user"].map((f) => (
                  <div key={f}>
                    <div className="flex justify-between text-sm">
                      <span>{f}</span>
                      <b>₹551</b>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-slate-400" style={{ width: "55%" }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm text-slate-500">Everyone pays the same, whatever they use.</p>
            </div>
            <div className="rounded-2xl border border-cyan-200 bg-white p-6 shadow-lg shadow-cyan-900/5">
              <div className="text-sm font-semibold text-cyan-700">With AquaLedger · by metered litres</div>
              <div className="mt-4 space-y-3">
                {[
                  ["D-202 · 20.4 kL", "₹992", 100, "bg-amber-500"],
                  ["C-301 · 7.2 kL", "₹446", 45, "bg-cyan-500"],
                  ["D-401 · 2.9 kL", "₹271", 27, "bg-emerald-500"],
                ].map(([f, amt, w, c]) => (
                  <div key={f as string}>
                    <div className="flex justify-between text-sm">
                      <span>{f}</span>
                      <b>{amt}</b>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full ${c}`} style={{ width: `${w}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm text-slate-500">Each flat pays for what it uses, plus ₹150 for common areas.</p>
            </div>
          </div>
        </div>
      </section>

      {/* who it's for */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: HomeIcon, who: "Committee & treasurer", what: "One dashboard for every source and rupee, bills in a click, and alerts before the AGM complaint." },
            { icon: GaugeIcon, who: "Facility manager", what: "Log tankers and readings from a phone, see which pump or flat is drawing water right now." },
            { icon: DropIcon, who: "Residents", what: "Their own usage against the building average and a bill they can understand. No more WhatsApp disputes." },
          ].map((p) => (
            <div key={p.who} className="rounded-2xl border border-slate-200 p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                <p.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-semibold">{p.who}</h3>
              <p className="mt-2 text-sm text-slate-600">{p.what}</p>
            </div>
          ))}
        </div>
      </section>

      {/* calculator */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-5xl px-4 md:px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">What would it save your society?</h2>
            <p className="mt-3 text-slate-600">Move the sliders. Leak savings alone, before fairer bills and better tanker planning.</p>
          </div>
          <SavingsCalculator />
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Simple per-flat pricing</h2>
            <p className="mt-3 text-slate-600">A 300-flat society pays about ₹3,600 a month: less than two summer tankers.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TIERS.map((t) => (
              <div key={t.name} className={`relative rounded-2xl border bg-white p-7 ${t.highlight ? "border-cyan-500 shadow-xl shadow-cyan-900/10 ring-4 ring-cyan-50" : "border-slate-200"}`}>
                {t.highlight && <span className="absolute -top-3 left-7 rounded-full bg-cyan-600 px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
                <h3 className="font-semibold">{t.name}</h3>
                <div className="mt-4">
                  <span className="text-5xl font-semibold tracking-tight">{t.price}</span>
                  <span className="text-sm text-slate-500"> per flat / month</span>
                </div>
                <ul className="mt-6 space-y-2.5 text-sm text-slate-700">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <CheckIcon className="h-4 w-4 text-cyan-600" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={`mt-7 block rounded-xl px-4 py-2.5 text-center text-sm font-medium ${t.highlight ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}
                >
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* faq */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">Questions committees ask</h2>
          <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span className="text-xl leading-none text-slate-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="px-4 py-20 md:px-6">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-600 via-cyan-700 to-teal-800 px-6 py-14 text-center text-white md:px-12">
          <SparkIcon className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Catch your society’s first leak this week.</h2>
          <p className="mx-auto mt-3 max-w-xl text-cyan-100">Set up takes a minute. Load demo data to explore, then add your own readings when you’re ready.</p>
          <Link href="/login" className="mt-8 inline-block rounded-xl bg-white px-6 py-3 font-semibold text-cyan-800 shadow-lg hover:bg-cyan-50">
            Set up your society →
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 md:px-6">
          <span className="flex items-center gap-2 font-medium text-slate-700">
            <DropIcon className="h-5 w-5 fill-cyan-500 stroke-cyan-600" /> AquaLedger
          </span>
          <span>Serverless on AWS · Mumbai region · © {new Date().getFullYear()} AquaLedger</span>
        </div>
      </footer>
    </div>
  );
}
