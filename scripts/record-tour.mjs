/**
 * Records the ~90-second product tour shown on the landing page (public/video/).
 *
 *   npm run record:tour
 *
 * Builds the offline demo, serves it, drives it with Playwright (visible cursor + captions),
 * captures frames with Chrome's screencast and encodes an H.264 MP4 + poster with ffmpeg.
 * Needs: ffmpeg on PATH, and a Chromium for Playwright (`npx playwright install chromium`,
 * or point CHROMIUM_PATH at an existing one).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
const OUT = join(tmpdir(), "aqualedger-tour-frames");
const PORT = 4400;
const B = `http://localhost:${PORT}`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("Building the offline demo…");
execFileSync("npm", ["run", "build:demo"], { stdio: "inherit" });
const server = spawn("npx", ["serve", "-l", String(PORT), "out"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

// caption bar + visible cursor that survive client-side navigation and reloads
await ctx.addInitScript(() => {
  const css = `
    #demo-banner{display:none!important}
    #tour-cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;max-width:1160px;width:max-content;
      display:flex;align-items:center;gap:14px;padding:16px 26px;border-radius:18px;background:rgba(2,6,23,.88);
      color:#fff;font:700 31px/1.25 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);
      transition:opacity .35s}
    #tour-cap b{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:44px;padding:0 10px;border-radius:12px;background:#06b6d4;color:#00222b;font-size:24px}
    #tour-cur{position:fixed;z-index:100000;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
      background:rgba(8,145,178,.35);border:2px solid #0891b2;pointer-events:none;transition:transform .12s}
    #tour-cur.down{transform:scale(.6);background:rgba(8,145,178,.7)}`;
  const mount = () => {
    if (document.getElementById("tour-cur")) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const cur = document.createElement("div"); cur.id = "tour-cur"; document.body.appendChild(cur);
    const pos = JSON.parse(sessionStorage.getItem("tour-pos") || "[640,360]");
    cur.style.left = pos[0] + "px"; cur.style.top = pos[1] + "px";
    addEventListener("mousemove", (e) => { cur.style.left = e.clientX + "px"; cur.style.top = e.clientY + "px"; sessionStorage.setItem("tour-pos", JSON.stringify([e.clientX, e.clientY])); }, true);
    addEventListener("mousedown", () => cur.classList.add("down"), true);
    addEventListener("mouseup", () => cur.classList.remove("down"), true);
    window.__cap = (step, text) => {
      sessionStorage.setItem("tour-cap", JSON.stringify([step, text]));
      let el = document.getElementById("tour-cap");
      if (!text) { el?.remove(); return; }
      if (!el) { el = document.createElement("div"); el.id = "tour-cap"; document.body.appendChild(el); }
      el.innerHTML = (step ? `<b>${step}</b>` : "") + `<span>${text}</span>`;
    };
    const saved = JSON.parse(sessionStorage.getItem("tour-cap") || "null");
    if (saved && saved[1]) window.__cap(saved[0], saved[1]);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount); else mount();
});

const page = await ctx.newPage();
// Record with Chrome's screencast (JPEG frames + timestamps); stitched into MP4 by ffmpeg afterwards.
const frames = [];
let cdp;
const startCast = async () => {
  cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", async (f) => {
    const file = `${OUT}/f${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
};
// the screencast only emits on repaint; a tiny ticking element keeps frames (and timing) flowing
await ctx.addInitScript(() => {
  const tick = () => {
    if (!document.body) return requestAnimationFrame(tick);
    let t = document.getElementById("tour-tick");
    if (!t) { t = document.createElement("div"); t.id = "tour-tick"; t.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:100001;pointer-events:none"; document.body.appendChild(t); }
    t.style.background = t.style.background === "rgb(254, 254, 254)" ? "rgb(255, 255, 255)" : "rgb(254, 254, 254)";
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const sleep = (ms) => page.waitForTimeout(ms);
const cap = (step, text) => page.evaluate(([s, t]) => window.__cap?.(s, t), [step, text]);
const moveTo = async (loc) => {
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
  await sleep(250);
};
const click = async (loc) => { await moveTo(loc); await loc.click(); };
const smoothScroll = (y) => page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "smooth" }), y);
const card = (title, sub, foot) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;
  background:radial-gradient(70% 60% at 70% 20%,#0e7490 0%,#083344 55%,#020617 100%)}
  .logo{font-size:30px;font-weight:700;letter-spacing:.3px;color:#a5f3fc} h1{margin:0;font-size:66px;letter-spacing:-1px;text-align:center;max-width:1000px;line-height:1.08}
  p{margin:0;font-size:30px;color:#cffafe;text-align:center;max-width:900px} .foot{margin-top:18px;font-size:18px;color:#67e8f9}
  </style></head><body><div class="logo">💧 AquaLedger</div><h1>${title}</h1><p>${sub}</p><div class="foot">${foot}</div></body></html>`;

// 0 · intro
await page.goto(B + "/", { waitUntil: "networkidle" });
await startCast();
await page.setContent(card("Every litre. Every rupee. Every leak.", "How an apartment society tracks its water, catches leaks and bills each flat fairly.", "A 90-second tour"));
await sleep(4200);

// 1 · dashboard
await page.goto(B + "/dashboard/", { waitUntil: "networkidle" });
await page.getByText("Top 10 flats").first().waitFor();
await cap("1", "See where the water comes from: municipal, borewell and tankers.");
await sleep(2500);
await moveTo(page.getByText("Cost per kL by source").first());
await cap("1", "Tanker water costs ~8× municipal, so every wasted litre is bought at tanker prices.");
await sleep(4200);

// 2 · leak scan
await cap("2", "Every night, each flat is checked for usage spikes and 2-4 a.m. flow.");
await click(page.getByRole("button", { name: /Run analysis now/ }));
await page.getByText("Leak detection impact").first().waitFor();
await sleep(600);
await moveTo(page.getByText("Leak detection impact").first());
await cap("2", "Leak caught in B-202: ~481 L a day, about ₹2,700 a month.");
await sleep(4500);

// 3 · alerts
await click(page.getByRole("link", { name: "Leak alerts" }));
await page.getByText("Night flow (2-4 a.m.)").first().waitFor();
await cap("3", "The committee gets the flat, the pattern and the litres wasted, by email too.");
await sleep(2000);
await moveTo(page.getByText("Night flow (2-4 a.m.)").first());
await sleep(2600);

// 4 · bills
await click(page.getByRole("link", { name: "Bills", exact: true }));
await page.getByText("Old equal split").first().waitFor();
await cap("4", "Bills in one click: each flat pays for the litres it actually used.");
await sleep(2500);
await moveTo(page.getByText("Flats paying less now").first());
await cap("4", "19 of 40 flats now pay less than the old equal split.");
await sleep(3800);
await smoothScroll(260); await sleep(900);
await click(page.locator("table a").first());
await page.getByText("Amount due").first().waitFor();
await cap("4", "Every resident gets a clear bill showing how it was calculated.");
await sleep(4200);

// 5 · forecast + AI
await click(page.getByRole("link", { name: "Forecast & insights" }));
await page.getByText("Tankers to book").first().waitFor();
await cap("5", "The forecast says how many tankers to book next month, and the budget.");
await sleep(2200);
await moveTo(page.getByText("Tankers to book").first());
await sleep(2400);
await cap("5", "Ask your water data anything, in plain English.");
await click(page.getByRole("button", { name: "Why did our bill go up this month?" }));
await page.getByText("Total water cost went from").first().waitFor();
await sleep(4600);

// 6 · live meter
await click(page.getByRole("link", { name: "Live meters" }));
await page.getByRole("button", { name: /Start meter/ }).waitFor();
await cap("6", "Smart meters stream live readings. A normal flat…");
await click(page.getByRole("button", { name: /Start meter/ }));
await sleep(7000);
await cap("6", "…and someone leaves a tap running.");
await click(page.getByRole("button", { name: /Open the tap/ }));
await page.getByText("is drawing").first().waitFor({ timeout: 20000 });
await sleep(800);
await cap("6", "An alert in seconds, and an email to the committee.");
await moveTo(page.getByText("is drawing").first());
await sleep(5200);
await click(page.getByRole("button", { name: /Stop meter/ }));
await cap(null, null);

// 7 · residents
await click(page.getByRole("link", { name: /Flats & residents/ }));
await page.getByRole("button", { name: "Give access to all flats" }).waitFor();
await cap("7", "Residents don't sign up. The committee gives every flat an access code…");
await sleep(2200);
page.once("dialog", (d) => d.accept());
await click(page.getByRole("button", { name: "Give access to all flats" }));
await page.getByText(/Access codes for \d+ flats/).first().waitFor();
await sleep(600);
await moveTo(page.getByText(/Access codes for \d+ flats/).first());
await cap("7", "…in one click, sent by email or WhatsApp, or printed as slips.");
await sleep(4200);
const row = page.locator("#access-sheet tr").first();
const residentUrl = (await row.locator("td").nth(2).innerText()).trim();
await page.goto(residentUrl.replace(/^https?:\/\/[^/]+/, B), { waitUntil: "networkidle" });
await page.getByText("Daily use vs building average").first().waitFor();
await cap("7", "The resident opens the link and sees only their flat: usage and bills.");
await sleep(4800);

// outro
await page.setContent(card("Set up your society in a minute.", "Catch leaks, end equal-split disputes and plan tankers before summer.", "Serverless on AWS · ₹10-15 per flat per month"));
await sleep(4200);

await cdp.send("Page.stopScreencast").catch(() => {});
await sleep(300);
// ffmpeg concat list: each frame shown until the next one arrived
const lines = [];
for (let i = 0; i < frames.length; i++) {
  const d = i + 1 < frames.length ? Math.max(frames[i + 1].t - frames[i].t, 0.001) : 0.5;
  lines.push(`file '${frames[i].file}'`, `duration ${d.toFixed(4)}`);
}
lines.push(`file '${frames[frames.length - 1].file}'`);
writeFileSync(`${OUT}/frames.txt`, lines.join("\n"));
console.log("frames:", frames.length, "seconds:", (frames.at(-1).t - frames[0].t).toFixed(1));
await ctx.close();
await browser.close();
server.kill();

console.log("Encoding public/video/aqualedger-tour.mp4 + .webm…");
mkdirSync("public/video", { recursive: true });
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${OUT}/frames.txt`,
  "-vf", "fps=30,scale=1280:720:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-tune", "stillimage",
  "-movflags", "+faststart", "-an", "public/video/aqualedger-tour.mp4"], { stdio: "inherit" });
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", "public/video/aqualedger-tour.mp4",
  "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-an", "public/video/aqualedger-tour.webm"], { stdio: "inherit" });
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", "1.5", "-i", "public/video/aqualedger-tour.mp4",
  "-frames:v", "1", "-q:v", "3", "public/video/aqualedger-tour-poster.jpg"], { stdio: "inherit" });
console.log("Done.");
