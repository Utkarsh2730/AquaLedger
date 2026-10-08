// Before `npm run dev` / `npm run demo`: if port 3000 is already taken (usually an old AquaLedger
// server left running in another Terminal window), say so loudly. Next.js would otherwise quietly
// switch to 3001 while the browser tab keeps showing the old, broken server on 3000.
import { createServer } from "node:net";

const port = Number(process.env.PORT || 3000);
const probe = createServer();
probe.once("error", (err) => {
  if (err.code !== "EADDRINUSE") return;
  const line = "─".repeat(68);
  console.warn(`\n${line}
⚠  Port ${port} is already in use, probably by an OLD AquaLedger server.
   Your browser tab on localhost:${port} is showing that old server, not this one.

   Stop it, then start again:
     kill $(lsof -ti:${port})
     npm run dev
${line}\n`);
});
probe.once("listening", () => probe.close());
probe.listen(port);
