# AquaLedger

AquaLedger is a water management SaaS for apartment societies: it tracks every litre from municipal supply, borewells and tankers, catches leaks automatically, bills each flat by actual usage, and forecasts shortages before the sump runs dry.

Built on a fully serverless AWS Amplify Gen 2 backend that fits the **AWS free tier**. See [docs/AWS_FREE_TIER.md](docs/AWS_FREE_TIER.md) for the cost of each service and where this build differs from the original roadmap.

## What's in the box

| Layer | Feature | Where |
| --- | --- | --- |
| Core | Auth & multi-tenancy (committee email login, one Cognito group per society; residents use a per-flat access code the committee issues) | `amplify/auth`, `amplify/data/resource.ts` |
| Core | Society setup: blocks, flats | `/onboarding`, `admin-ops` Lambda |
| Core | Seed data: 40 flats, 6 months, summer spikes, planted leak in **B-202** | `lib/core/seed.ts` |
| Core | Tanker, municipal and borewell logging | `/sources` |
| Core | Meter readings: manual entry + CSV import | `/readings` |
| Core | Dashboard: KPIs, source mix, cost per kL by source, top 10 flats, daily trend | `/dashboard`, `query-api` Lambda |
| Intelligence | Usage-based billing (+ comparison with the old equal split), printable bills | `/bills`, `lib/core/billing.ts` |
| Intelligence | Leak detection: z-score > 2.5 vs 30-day mean; steady 2-4 a.m. flow on 3+ nights | `/alerts`, `lib/core/leak.ts` |
| Intelligence | Shortage forecast: 3-month moving average × seasonal factor → tankers & cost | `/insights`, `lib/core/forecast.ts` |
| Intelligence | Alert & bill emails (SNS) | `amplify/functions/shared/notify.ts` |
| Intelligence | Nightly scan, monthly billing (EventBridge schedule) | `amplify/functions/analysis` |
| Intelligence | Monthly summary + "Ask your water data" chat (rule-based, free) | `/insights` |
| Extras | Live meters: connection details for real meters, an in-browser meter test, and `scripts/meter_simulator.py` | `/live`, `meter-ingest` Lambda |
| Extras | Resident portal: open with the flat's access code (no account), which the committee sends to every resident from its own list by email and WhatsApp; own usage vs building average, own bills | `/resident` |
| Extras | Landing page with pricing tiers | `/` |

## Architecture

```
Next.js (static export, Amplify Hosting)
   │  Cognito (committee email login, ADMINS / <societyId> groups; guest identity for residents)
   ▼
AppSync GraphQL ──► DynamoDB (Society, Flat, Reading, TankerDelivery, SourceSupply, Bill, Alert, Insight)
   │ custom queries/mutations
   ├─► admin-ops   Lambda: setupSociety, seedDemoData, issue/revoke/sendResidentAccess (SES email, WhatsApp), importReadingsCsv
   ├─► query-api   Lambda: getDashboard, getFlatDetail, askWaterData, residentPortal(code)
   └─► analysis    Lambda: runAnalysis (leaks / billing / insights) ◄── EventBridge nightly schedule
                                                    └──► SNS topic ──► admin emails
Smart meter / simulator ──HTTPS──► meter-ingest Lambda (Function URL) ──► DynamoDB + live alert + SNS
```

All analytics live in `lib/core/` as plain TypeScript with no AWS dependencies, shared by the Lambdas and the UI and covered by unit tests.

## Try it in 30 seconds (offline demo mode)

No AWS account needed. The whole app runs in your browser with 6 months of demo data:

```bash
npm install
npm run demo        # http://localhost:3000
```

Every page works: leak scans, bills, forecast, chat, the live meter, flats, settings. Changes are kept in the browser; **Settings → Replace with sample data** starts over. It uses the same leak, billing and forecast logic as the real backend, so it's also your **stage backup if Wi-Fi or AWS fails**.

## Deploy

Prerequisites: Node.js 20+, an AWS account, AWS CLI configured (`aws configure` or SSO) with a profile that can deploy Amplify. Pick one region and use it for everything (e.g. `ap-south-1` Mumbai).

**Option A — cloud sandbox (fastest for development)**

```bash
npm install
npx ampx sandbox            # deploys the backend to your account and writes amplify_outputs.json
npm run dev                 # http://localhost:3000
```

**Option B — Amplify Hosting (live URL for judges).** Full steps and settings are in [docs/DEPLOY.md](docs/DEPLOY.md).

1. Push this repo to GitHub.
2. AWS console → Amplify → *Create new app* → GitHub → pick the repo and branch.
3. Amplify detects `amplify.yml`; it deploys the backend and the static site on every push.
4. Give the app a service role with **AmplifyBackendDeployFullAccess** (App settings → IAM roles) or the backend step fails with a credentials error.
5. The site is a static export (`out/`). If the build succeeds but every page is a 404, the app was created as a server-side (compute) app: run `aws amplify update-app --app-id <id> --platform WEB` and redeploy.

Then:

1. Open the URL → **Committee login → Create Account**, confirm the email code.
2. Create the society with **Start with 6 months of sample data** ticked.
3. Confirm the "AWS Notification - Subscription Confirmation" email so alerts reach you.
4. **Alerts → Scan for leaks now**: B-202 is flagged twice (spike + night flow).
5. **Bills → Generate bills**, open one, *Download PDF*.
6. **Live meters → Start meter → Open the tap**: an alert appears in seconds and an email follows.

## Demo script (3 minutes)

1. Hook: tanker spend last summer, split equally.
2. Dashboard: where the water and money go (`/dashboard`).
3. Live leak: `/live` → start meter → open tap → alert + email.
4. Fair billing: `/bills` → generate → open a bill; note "vs equal split".
5. Forecast: `/insights` → "Next month you need ~N tankers; book early."
6. Ask your water data: "Why did our bill go up this month?"
7. Close: ₹10-15 per flat per month; pays for itself with one leak.

Before presenting: **Settings → Replace with sample data** for a known starting state.

## Develop

```bash
npm test             # unit tests (lib/core) + end-to-end handler tests against an in-memory DynamoDB
npm run typecheck    # frontend + backend
npm run build        # static export to out/
npm run demo         # offline demo mode (no AWS)
npm run record:tour  # re-record the landing-page tour video after UI changes (needs ffmpeg)
```

CSV format for imports (`flat, date, hour, litres`; leave `hour` empty for daily totals):

```csv
flat,date,hour,litres
A-101,2026-10-01,,412
B-202,2026-10-01,3,21.5
```

## Clean up

`npx ampx sandbox delete`, or delete the app in the Amplify console.

Author-Utkarsh Sonthalia

Link-https://main.d200aasztxvlg1.amplifyapp.com
