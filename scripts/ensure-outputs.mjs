// Demo mode never contacts AWS, but the app imports amplify_outputs.json at build time.
// Write a placeholder only when no real one exists (a real one is never overwritten).
import { existsSync, writeFileSync } from "node:fs";

if (!existsSync("amplify_outputs.json")) {
  writeFileSync("amplify_outputs.json", JSON.stringify({ version: "1.4", demo: true }, null, 2) + "\n");
  console.log("Wrote placeholder amplify_outputs.json for demo mode");
}
