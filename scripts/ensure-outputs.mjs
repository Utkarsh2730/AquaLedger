// The app imports amplify_outputs.json, which `npx ampx sandbox` (or the Amplify Hosting build)
// writes with your AWS backend's addresses. It is not committed, so a fresh copy of the code
// doesn't have it. This writes a placeholder when it's missing so every command still starts;
// the app then shows "connect your backend" instead of crashing. A real file is never touched.
import { existsSync, writeFileSync } from "node:fs";

if (!existsSync("amplify_outputs.json")) {
  writeFileSync("amplify_outputs.json", JSON.stringify({ version: "1.4", placeholder: true }, null, 2) + "\n");
  console.log("amplify_outputs.json not found: wrote a placeholder. Run `npx ampx sandbox` to connect your AWS backend, or `npm run demo` to try it offline.");
}
