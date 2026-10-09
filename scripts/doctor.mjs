// `npm run doctor`: checks why the app won't open on this computer and prints the fix for each
// problem: old code, missing packages, port 3000, the dev server, the AWS connection.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";

const BRANCH = "main";
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m, fix) => {
  problems++;
  console.log(`  ❌ ${m}\n     → ${fix.split("\n").join("\n       ")}`);
};
const warn = (m, fix) => console.log(`  ⚠️  ${m}${fix ? `\n     → ${fix}` : ""}`);
const sh = (cmd) => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20000 }).trim();
  } catch {
    return null;
  }
};
let problems = 0;

console.log("\nAquaLedger check-up\n");

// 1. Node
const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) ok(`Node.js ${process.versions.node}`);
else bad(`Node.js ${process.versions.node} is too old`, "Install Node.js 22 LTS from https://nodejs.org, then run this again.");

// 2. Code version
const branch = sh("git rev-parse --abbrev-ref HEAD");
const head = sh("git log --oneline -1");
if (!branch) bad("This folder isn't the AquaLedger git repository", "cd into your AquaLedger project folder first.");
else {
  if (branch !== BRANCH) bad(`On branch "${branch}"`, `git checkout ${BRANCH}`);
  sh(`git fetch -q origin ${BRANCH}`);
  const behind = Number(sh(`git rev-list --count HEAD..origin/${BRANCH}`) ?? "0");
  const dirty = (sh("git diff --name-only HEAD") ?? "").split("\n").filter(Boolean);
  if (behind > 0) {
    bad(
      `Your code is ${behind} update${behind === 1 ? "" : "s"} behind (you have: ${head})`,
      `${dirty.length ? "git stash\n" : ""}git pull origin ${BRANCH}\nnpm install`
    );
  } else ok(`Code is up to date (${head})`);
  if (dirty.length && behind === 0) warn(`Changed files on this computer: ${dirty.join(", ")}`, "Fine to keep; `git stash` sets them aside if a pull is ever blocked.");
}

// 3. Packages
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const missing = Object.keys(pkg.dependencies ?? {}).filter((d) => !existsSync(`node_modules/${d}/package.json`));
if (!existsSync("node_modules")) bad("Packages aren't installed", "npm install");
else if (missing.length) bad(`Missing packages: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}`, "npm install");
else ok("All packages installed");

// 4. AWS connection
let outputs = null;
try {
  outputs = JSON.parse(readFileSync("amplify_outputs.json", "utf8"));
} catch {}
if (!outputs || outputs.placeholder) {
  warn("Not connected to your AWS backend yet", "In a second Terminal window: npx ampx sandbox   (or use `npm run demo` to try it offline)");
} else {
  const mi = outputs.data?.model_introspection;
  const needed = ["sendResidentAccess", "issueResidentAccess", "revokeResidentAccess", "setupSociety", "runAnalysis"];
  const have = mi?.mutations ? needed.filter((m) => !mi.mutations[m]) : [];
  const args = mi?.mutations?.sendResidentAccess?.arguments ?? {};
  if (have.length || (mi?.mutations && !("includeUncontacted" in args))) {
    bad("Your AWS backend is older than the code", "In the Terminal window running `npx ampx sandbox`: press Control+C, run `npx ampx sandbox` again, and wait for “Deployment completed”.");
  } else ok(`Connected to AWS (${outputs.auth?.aws_region ?? "region ?"})`);
}

// 5. Port 3000 / dev server
const port = Number(process.env.PORT || 3000);
// servers may listen on IPv4 or IPv6 only (macOS often uses ::1 for localhost)
const canConnect = (host) =>
  new Promise((resolve) => {
    const s = createConnection({ port, host });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
    setTimeout(() => (s.destroy(), resolve(false)), 1500);
  });
const listening = (await canConnect("127.0.0.1")) || (await canConnect("::1"));
if (!listening) {
  bad(`Nothing is running on localhost:${port}: the website is off`, "npm run dev\nThen wait for “✓ Ready” and keep that Terminal window open.");
} else {
  let status = null;
  try {
    const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(60000) });
    status = res.status;
    const html = await res.text();
    if (res.ok && !html.includes("AquaLedger")) status = "not-aqualedger";
  } catch {}
  const pid = sh(`lsof -ti:${port} -sTCP:LISTEN`);
  if (status === 200) ok(`Website is running: http://localhost:${port}`);
  else if (status === "not-aqualedger") bad(`Another program is using port ${port}`, `kill ${pid ?? "$(lsof -ti:" + port + ")"}\nnpm run dev`);
  else
    bad(
      `A server is on port ${port} but the page fails (${status ?? "no answer"}); usually an old server or a broken cache`,
      `kill ${pid ?? "$(lsof -ti:" + port + ")"}\nrm -rf .next\nnpm run dev`
    );
}

console.log(problems ? `\n${problems} problem${problems === 1 ? "" : "s"} found: run the commands above in order, then \`npm run doctor\` again.\n` : "\nEverything looks good.\n");
