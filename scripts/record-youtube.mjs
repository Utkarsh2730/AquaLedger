/**
 * Records the YouTube demo video: 1080p, ~2.5 minutes, chapter cards, captions, original background
 * music, a thumbnail, and a description with chapter timestamps.
 *
 *   npm run record:youtube        → media/youtube/{aqualedger-demo.mp4, thumbnail.jpg, description.txt}
 *
 * Builds the offline demo, drives it with Playwright (visible cursor + captions), captures frames
 * with Chrome's screencast, and encodes with ffmpeg. Needs ffmpeg, python3 + numpy, and a Chromium
 * for Playwright (or CHROMIUM_PATH).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const OUT_DIR = "media/youtube";
const FRAMES = join(tmpdir(), "aqualedger-youtube-frames");
const PORT = 4401;
const B = `http://localhost:${PORT}`;
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

if (!process.argv.includes("--no-build")) {
  console.log("Building the offline demo…");
  execFileSync("npm", ["run", "build:demo"], { stdio: "inherit" });
}
const server = spawn("npx", ["serve", "-l", String(PORT), "out"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// 1600×900 CSS pixels at 1.2× = 1920×1080 frames: crisp, and the UI reads at YouTube sizes
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });

await ctx.addInitScript(() => {
  const css = `
    #demo-banner{display:none!important}
    #yt-cap{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:99999;max-width:1400px;width:max-content;
      display:flex;align-items:center;gap:16px;padding:16px 28px;border-radius:18px;background:rgba(2,6,23,.9);
      color:#fff;font:700 30px/1.3 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.28)}
    #yt-cap b{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:46px;height:46px;padding:0 12px;border-radius:12px;background:#22d3ee;color:#04222b;font-size:22px;letter-spacing:.02em}
    #yt-cur{position:fixed;z-index:100000;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;
      background:rgba(34,211,238,.35);border:2.5px solid #0891b2;pointer-events:none;transition:transform .12s}
    #yt-cur.down{transform:scale(.6);background:rgba(8,145,178,.75)}`;
  const mount = () => {
    if (document.getElementById("yt-cur")) return;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    const cur = document.createElement("div");
    cur.id = "yt-cur";
    document.body.appendChild(cur);
    const pos = JSON.parse(sessionStorage.getItem("yt-pos") || "[800,450]");
    cur.style.left = pos[0] + "px";
    cur.style.top = pos[1] + "px";
    addEventListener("mousemove", (e) => {
      cur.style.left = e.clientX + "px";
      cur.style.top = e.clientY + "px";
      sessionStorage.setItem("yt-pos", JSON.stringify([e.clientX, e.clientY]));
    }, true);
    addEventListener("mousedown", () => cur.classList.add("down"), true);
    addEventListener("mouseup", () => cur.classList.remove("down"), true);
    window.__cap = (step, text) => {
      sessionStorage.setItem("yt-cap", JSON.stringify([step, text]));
      let el = document.getElementById("yt-cap");
      if (!text) return el?.remove();
      if (!el) {
        el = document.createElement("div");
        el.id = "yt-cap";
        document.body.appendChild(el);
      }
      el.innerHTML = (step ? `<b>${step}</b>` : "") + `<span>${text}</span>`;
    };
    const saved = JSON.parse(sessionStorage.getItem("yt-cap") || "null");
    if (saved && saved[1]) window.__cap(saved[0], saved[1]);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount);
  else mount();
});
// the screencast only emits on repaint: a 1px ticking element keeps frames and timing flowing
await ctx.addInitScript(() => {
  const tick = () => {
    if (!document.body) return requestAnimationFrame(tick);
    let el = document.getElementById("yt-tick");
    if (!el) {
      el = document.createElement("div");
      el.id = "yt-tick";
      el.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:100001;pointer-events:none";
      document.body.appendChild(el);
    }
    el.style.background = el.style.background === "rgb(254, 254, 254)" ? "rgb(255, 255, 255)" : "rgb(254, 254, 254)";
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
const frames = [];
let cdp;
const startCast = async () => {
  cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", async (f) => {
    const file = `${FRAMES}/f${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
};

const sleep = (ms) => page.waitForTimeout(ms);
const cap = (step, text) => page.evaluate(([s, t]) => window.__cap?.(s, t), [step, text]);
const moveTo = async (loc) => {
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
  await sleep(250);
};
const click = async (loc) => {
  await moveTo(loc);
  await loc.click();
};
const smoothScroll = (y) => page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "smooth" }), y);

// chapter markers for the YouTube description (frame index → time, so they match the video exactly)
const chapters = [];
const mark = (title) => chapters.push({ title, frame: frames.length });

const shell = (body, extraCss = "") => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;text-align:center;
  background:radial-gradient(70% 60% at 70% 20%,#0e7490 0%,#083344 55%,#020617 100%)}
  .logo{font-size:28px;font-weight:700;color:#a5f3fc;letter-spacing:.3px} h1{margin:0;font-size:68px;letter-spacing:-1.5px;max-width:1300px;line-height:1.08}
  p{margin:0;font-size:30px;color:#cffafe;max-width:1150px;line-height:1.35} .foot{margin-top:14px;font-size:20px;color:#67e8f9}
  .chip{display:inline-flex;align-items:center;justify-content:center;width:84px;height:84px;border-radius:22px;background:#22d3ee;color:#04222b;font-size:42px;font-weight:800}
  ${extraCss}</style></head><body>${body}</body></html>`;
const titleCard = (title, sub, foot = "") => shell(`<div class="logo">💧 AquaLedger</div><h1>${title}</h1><p>${sub}</p>${foot ? `<div class="foot">${foot}</div>` : ""}`);
const chapterCard = (n, title, sub) => shell(`<div class="chip">${n}</div><h1>${title}</h1><p>${sub}</p>`);
const problemCard = () =>
  shell(
    `<div class="logo">The problem</div>
     <div class="rows">
       <div class="row"><span>🚚</span><div><b>Summer means tankers.</b> Societies pay up to 8× municipal rates for every tanker litre.</div></div>
       <div class="row"><span>⚖️</span><div><b>Bills are split equally.</b> The flat with a leaking tap pays the same as everyone else.</div></div>
       <div class="row"><span>💧</span><div><b>Leaks go unnoticed for weeks</b>, and nobody can say how many tankers next month needs.</div></div>
     </div>`,
    `.rows{display:flex;flex-direction:column;gap:22px;text-align:left;max-width:1250px}
     .row{display:flex;gap:22px;align-items:center;font-size:34px;line-height:1.3;color:#e0f2fe;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:22px 28px}
     .row span{font-size:46px} .row b{color:#fff}`
  );
const awsCard = () =>
  shell(
    `<div class="logo">Under the hood</div><h1>Serverless on AWS</h1>
     <div class="grid">${[
       ["Amplify Gen 2", "hosting + infrastructure as code"],
       ["Cognito", "committee sign-in, per-society access"],
       ["AppSync + DynamoDB", "API and data"],
       ["Lambda", "billing, leak scan, forecast, AI"],
       ["EventBridge Scheduler", "nightly scan, monthly bills"],
       ["Bedrock (Claude)", "monthly summary + chat"],
       ["SNS / SES / WhatsApp", "alerts and resident logins"],
       ["Function URL", "live smart-meter ingest"],
     ]
       .map(([a, b]) => `<div class="cell"><b>${a}</b><span>${b}</span></div>`)
       .join("")}</div>
     <p>Nothing always-on: it fits inside the AWS free tier at society scale.</p>`,
    `.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;max-width:1450px;margin:10px 0 6px}
     .cell{display:flex;flex-direction:column;gap:6px;text-align:left;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:18px 20px}
     .cell b{font-size:24px;color:#fff} .cell span{font-size:19px;color:#a5f3fc}`
  );

// ── intro ────────────────────────────────────────────────────────────────────────────────────
await page.goto(B + "/", { waitUntil: "networkidle" });
await startCast();
mark("Intro: the problem and AquaLedger");
await page.setContent(titleCard("Every litre. Every rupee. Every leak.", "Water management for apartment societies: track supply, catch leaks, bill each flat fairly, plan tankers.", "AquaLedger · product demo"));
await sleep(5000);
await page.setContent(problemCard());
await sleep(8500);

// ── landing page ─────────────────────────────────────────────────────────────────────────────
await page.goto(B + "/", { waitUntil: "networkidle" });
await sleep(400);
await cap(null, "AquaLedger: one place for the committee to run the society's water.");
await sleep(3500);
await smoothScroll(900);
await sleep(2600);
await cap(null, "Set up a society in a minute, or try it with realistic demo data.");
await smoothScroll(1900);
await sleep(3200);
await cap(null, null);

// ── 1 dashboard ──────────────────────────────────────────────────────────────────────────────
mark("1. Dashboard: where the water and money go");
await page.setContent(chapterCard(1, "The dashboard", "Where the water comes from, and where the money goes."));
await sleep(3000);
await page.goto(B + "/dashboard/", { waitUntil: "networkidle" });
await page.getByText("Top 10 flats").first().waitFor();
await cap("1", "Municipal, borewell and tankers: every litre, every month.");
await moveTo(page.getByText("Where the water comes from").first());
await sleep(3800);
await moveTo(page.getByText("Cost per kL by source").first());
await cap("1", "Tanker water costs about 8× municipal, so wasted water is bought at tanker prices.");
await sleep(4500);
await smoothScroll(1050);
await cap("1", "The heaviest users stand out at a glance.");
await sleep(3800);
await smoothScroll(0);
await sleep(800);

// ── 2 leaks ──────────────────────────────────────────────────────────────────────────────────
mark("2. Automatic leak detection");
await page.setContent(chapterCard(2, "Leak detection", "Every flat, every night: usage spikes and water running at 2–4 a.m."));
await sleep(3000);
await page.goto(B + "/dashboard/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Run analysis now/ }).waitFor();
await cap("2", "The nightly scan runs automatically. Here we run it now.");
await click(page.getByRole("button", { name: /Run analysis now/ }));
await page.getByText("Leak detection impact").first().waitFor();
await sleep(500);
await moveTo(page.getByText("Leak detection impact").first());
await cap("2", "Leak caught in flat B-202: about 481 litres a day, ₹2,700 a month at tanker prices.");
await sleep(5000);
await click(page.getByRole("link", { name: /Leak alerts/ }).first());
await page.getByText("Night flow (2-4 a.m.)").first().waitFor();
await cap("2", "The committee gets the flat, the pattern and the litres wasted, by email too.");
await moveTo(page.getByText("Night flow (2-4 a.m.)").first());
await sleep(4800);

// ── 3 bills ──────────────────────────────────────────────────────────────────────────────────
mark("3. Fair, usage-based bills");
await page.setContent(chapterCard(3, "Fair bills", "Each flat pays for the water it actually used. No more equal-split disputes."));
await sleep(3000);
await page.goto(B + "/bills/", { waitUntil: "networkidle" });
await page.getByText("Old equal split").first().waitFor();
await cap("3", "Bills for every flat in one click: share of metered litres × the society's water cost.");
await sleep(4200);
await moveTo(page.getByText("Flats paying less now").first());
await cap("3", "19 of 40 flats now pay less: they were subsidising the heavy users.");
await sleep(4200);
await smoothScroll(300);
await sleep(800);
await click(page.locator("main table a").first());
await page.getByText("Amount due").first().waitFor();
await cap("3", "Every resident gets a bill that shows exactly how it was calculated.");
await sleep(5000);

// ── 4 forecast + AI ──────────────────────────────────────────────────────────────────────────
mark("4. Tanker forecast and AI answers");
await page.setContent(chapterCard(4, "Forecast & AI", "Book tankers before summer hits, and ask your water data anything."));
await sleep(3000);
await page.goto(B + "/insights/", { waitUntil: "networkidle" });
await page.getByText("Tankers to book").first().waitFor();
await moveTo(page.getByText("Tankers to book").first());
await cap("4", "Next month: how much water you'll need, how many tankers, and the budget.");
await sleep(4500);
await cap("4", "Ask in plain English. Answers come from your own data (Claude on Amazon Bedrock).");
await click(page.getByRole("button", { name: "Why did our bill go up this month?" }));
await page.getByText("Total water cost went from").first().waitFor();
await sleep(6000);

// ── 5 live meter ─────────────────────────────────────────────────────────────────────────────
mark("5. Live smart-meter leak alert");
await page.setContent(chapterCard(5, "Live smart meters", "A tap left running raises an alert within seconds."));
await sleep(3000);
await page.goto(B + "/live/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Start meter/ }).waitFor();
await cap("5", "A smart meter streams readings every few seconds. Normal use first…");
await click(page.getByRole("button", { name: /Start meter/ }));
await sleep(7500);
await cap("5", "…then someone leaves a tap running.");
await click(page.getByRole("button", { name: /Open the tap/ }));
await page.getByText("is drawing").first().waitFor({ timeout: 25000 });
await sleep(700);
await moveTo(page.getByText("is drawing").first());
await cap("5", "Alert in seconds, and an email to the committee.");
await sleep(5500);
await click(page.getByRole("button", { name: /Stop meter/ }));

// ── 6 residents ──────────────────────────────────────────────────────────────────────────────
mark("6. Resident access by email and WhatsApp");
await page.setContent(chapterCard(6, "Residents", "No sign-ups or passwords: the committee gives each flat an access code."));
await sleep(3000);
await page.goto(B + "/flats/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Give access to all flats" }).waitFor();
await cap("6", "Add the resident list you already have: emails and mobile numbers.");
await moveTo(page.getByRole("button", { name: /Add emails & mobiles/ }));
await sleep(3200);
await cap("6", "Then one click gives every flat its login.");
await click(page.getByRole("button", { name: "Give access to all flats" }));
await page.getByText(/Access codes for \d+ flats/).first().waitFor();
await sleep(500);
await moveTo(page.getByText(/Access codes for \d+ flats/).first());
await cap("6", "Sent by email and WhatsApp, or printed as slips for letterboxes.");
await sleep(5000);
const residentUrl = (await page.locator("#access-sheet tr").first().locator("td").nth(2).innerText()).trim();
await page.goto(residentUrl.replace(/^https?:\/\/[^/]+/, B), { waitUntil: "networkidle" });
await page.getByText("Daily use vs building average").first().waitFor();
await cap("6", "The resident taps the link and sees only their own flat: usage, bills, leak alerts.");
await sleep(5500);
await cap(null, null);

// ── architecture + outro ─────────────────────────────────────────────────────────────────────
mark("Built on AWS, and pricing");
await page.setContent(awsCard());
await sleep(8000);
await page.setContent(titleCard("It pays for itself with one leak.", "₹10–15 per flat per month. Catch leaks, end equal-split disputes, and plan tankers before summer.", "AquaLedger · water management for apartment societies"));
await sleep(6500);

// thumbnail: big headline over a dashboard screenshot
const shotPage = await ctx.newPage();
await shotPage.setViewportSize({ width: 1600, height: 900 });
await shotPage.goto(B + "/dashboard/", { waitUntil: "networkidle" });
await shotPage.getByText("Top 10 flats").first().waitFor();
await shotPage.evaluate(() => document.getElementById("yt-cur")?.remove());
const dash = (await shotPage.screenshot({ type: "jpeg", quality: 85 })).toString("base64");
await shotPage.setViewportSize({ width: 1280, height: 720 });
await shotPage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;width:1280px;height:720px;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#020617;position:relative}
  img{position:absolute;right:-120px;top:90px;width:900px;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.6);transform:perspective(1400px) rotateY(-14deg)}
  .fade{position:absolute;inset:0;background:linear-gradient(90deg,#020617 38%,rgba(2,6,23,.55) 62%,rgba(2,6,23,0) 85%)}
  .txt{position:absolute;left:60px;top:70px;width:640px;color:#fff}
  .logo{font-size:30px;font-weight:800;color:#67e8f9} h1{margin:18px 0 0;font-size:92px;line-height:.98;letter-spacing:-3px;font-weight:900}
  h1 em{font-style:normal;color:#22d3ee} .tag{margin-top:26px;display:inline-block;padding:12px 20px;border-radius:14px;background:#f43f5e;font-size:30px;font-weight:800}
  </style></head><body><img src="data:image/jpeg;base64,${dash}"><div class="fade"></div>
  <div class="txt"><div class="logo">💧 AquaLedger</div><h1>Catch leaks.<br><em>Bill fairly.</em></h1><div class="tag">Water app for societies</div></div></body></html>`);
await shotPage.screenshot({ path: `${FRAMES}/thumbnail-hidpi.jpg`, type: "jpeg", quality: 95 });
await shotPage.close();

await cdp.send("Page.stopScreencast").catch(() => {});
await sleep(300);
await ctx.close();
await browser.close();
server.kill();

// ── encode ───────────────────────────────────────────────────────────────────────────────────
const t0 = frames[0].t;
const lines = [];
for (let i = 0; i < frames.length; i++) {
  const d = i + 1 < frames.length ? Math.max(frames[i + 1].t - frames[i].t, 0.001) : 0.5;
  lines.push(`file '${frames[i].file}'`, `duration ${d.toFixed(4)}`);
}
lines.push(`file '${frames.at(-1).file}'`);
writeFileSync(`${FRAMES}/frames.txt`, lines.join("\n"));
const seconds = frames.at(-1).t - t0 + 0.5;
console.log("frames:", frames.length, "seconds:", seconds.toFixed(1));

execFileSync("python3", ["scripts/youtube-music.py", String(Math.ceil(seconds) + 1), `${FRAMES}/music.wav`], { stdio: "inherit" });
console.log("Encoding media/youtube/aqualedger-demo.mp4…");
execFileSync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", `${FRAMES}/frames.txt`,
    "-i", `${FRAMES}/music.wav`,
    "-vf", "fps=60,scale=1920:1080:flags=lanczos,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-tune", "stillimage", "-g", "120",
    "-c:a", "aac", "-b:a", "192k", "-shortest",
    "-movflags", "+faststart", `${OUT_DIR}/aqualedger-demo.mp4`,
  ],
  { stdio: "inherit" }
);

// YouTube's thumbnail size: 1280×720
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", `${FRAMES}/thumbnail-hidpi.jpg`, "-vf", "scale=1280:720:flags=lanczos", "-q:v", "2", `${OUT_DIR}/thumbnail.jpg`], { stdio: "inherit" });

// YouTube chapters: first must be 0:00, each at least 10 s. Every chapter opens on a dark title card,
// so the exact start times are read from the finished video (frames arrive slightly after they're
// drawn, which makes marks taken during recording a little early).
const ts = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const marked = chapters.map((c) => frames[Math.min(c.frame, frames.length - 1)].t - t0);
// signalstats prints to stderr
const stats = spawnSync(
  "ffmpeg",
  ["-hide_banner", "-i", `${OUT_DIR}/aqualedger-demo.mp4`, "-vf", "fps=4,scale=160:90,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
).stderr;
const darkStarts = [];
let wasDark = false;
let pts = 0;
for (const line of stats.split(/[\r\n]/)) {
  const p = line.match(/pts_time:([0-9.]+)/);
  if (p) pts = Number(p[1]);
  const y = line.match(/YAVG=([0-9.]+)/);
  if (!y) continue;
  const dark = Number(y[1]) < 60;
  if (dark && !wasDark) darkStarts.push(pts);
  wasDark = dark;
}
// match each mark to the dark card starting closest to it
const nearestCard = (m) => darkStarts.filter((d) => Math.abs(d - m) < 4).sort((a, b) => Math.abs(a - m) - Math.abs(b - m))[0] ?? m;
const starts = marked.map((m, i) => (i === 0 ? 0 : nearestCard(m)));
const chapterLines = chapters
  .map((c, i) => ({ ...c, s: starts[i] }))
  .reduce((kept, c) => (kept.length === 0 || c.s - kept.at(-1).s >= 10 ? [...kept, c] : kept), [])
  .map((c) => `${ts(c.s)} ${c.title}`);
const description = `AquaLedger is a water management app for apartment societies. It tracks every litre from municipal supply, borewells and tankers, catches leaks automatically, bills each flat by actual usage, and forecasts how many tankers next month needs.

In this demo:
• A live dashboard of water sources and costs
• Automatic leak detection (usage spikes and 2–4 a.m. flow), with alerts to the committee
• Fair usage-based bills instead of an equal split
• Tanker forecast and plain-English answers from your data (Claude on Amazon Bedrock)
• A smart meter raising a live leak alert
• Resident logins sent by email and WhatsApp, with no sign-ups

Chapters
${chapterLines.join("\n")}

Built serverless on AWS (Amplify Gen 2, Cognito, AppSync, DynamoDB, Lambda, EventBridge Scheduler, Bedrock, SNS/SES), designed to fit the AWS free tier.

#AWS #Serverless #WaterManagement #Hackathon #SmartCity #NextJS
`;
writeFileSync(`${OUT_DIR}/description.txt`, description);
console.log(`\nDone: ${OUT_DIR}/aqualedger-demo.mp4, thumbnail.jpg, description.txt\n`);
console.log(chapterLines.join("\n"));
