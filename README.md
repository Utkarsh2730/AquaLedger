# AquaLedger

**Water management for apartment societies.** AquaLedger shows a housing society's committee where its water comes from, where the money goes, and which flat is wasting it. It catches leaks automatically, bills every flat for the water it actually used, and tells the committee how many tankers to book before summer.

- **Live app:** https://main.d200aasztxvlg1.amplifyapp.com
- **Product tour:** *Watch demo* on the home page (about 90 seconds)
- **Runs on:** Amazon Web Services, fully serverless, inside the AWS free tier at society scale
- **Source code:** https://github.com/Utkarsh2730/AquaLedger

---

## The problem

Indian apartment societies buy water from three sources: the municipal supply, their own borewell, and private tankers. Tanker water costs about **8 times** as much as municipal water, and it fills the gap every summer.

Most societies run this on paper and spreadsheets, which causes three problems:

1. **Leaks go unnoticed for weeks.** A single running cistern wastes about 480 litres a day. Every wasted litre is replaced with tanker water at the highest price.
2. **Bills are split equally.** A family of two pays the same as a family of six, and the flat with the leak pays the same as everyone else. This is a constant source of disputes in committee meetings.
3. **Tankers are booked in a panic.** Nobody knows how much water next month needs until the sump runs dry.

## What AquaLedger does

| Outcome | How |
| --- | --- |
| **Catch leaks early** | Every night, each flat is checked for unusual usage and for water running between 2 and 4 a.m., when nobody should be using it. Smart meters raise an alert within seconds. The committee gets an email naming the flat, the pattern and the litres wasted. |
| **Fair bills** | Each flat pays its share of the litres it actually used, plus a fixed common-area charge. Bills are generated for every flat in one click, and each bill shows how it was calculated. In the sample society, 19 of 40 flats pay less than under the equal split. |
| **No surprises** | A seasonal forecast gives next month's water need, the number of tankers to book and the budget. The committee can ask plain-English questions such as "Why did our bill go up this month?" and get answers worked out from its own data. |
| **One clear picture** | A dashboard shows water and cost by source, the cost per kilolitre of each source, the heaviest users and the daily trend. |

## Who uses it, and how they get in

### Committee members (secretary, treasurer, facility manager)

1. Open the app and choose **Committee login → Create Account**.
2. Enter an email and password, then type in the 6-digit code that is emailed to confirm the address.
3. Set up the society once: its name, city, blocks or wings, and the number of flats per block.
4. From then on, sign in with email and password. Other members can be invited from **Settings → Committee members**; they receive an email with a temporary password.

Each society's data is completely separate. A committee member can only ever see their own society.

### Residents

Residents never create an account or remember a password.

1. The committee adds the resident list it already has (emails and mobile numbers) and clicks **Give access to all flats**.
2. Every flat gets its own access code, sent by WhatsApp or email, or printed as slips for letterboxes.
3. The resident opens **Resident login**, types the code (or taps the link in the message), and sees **only their own flat**: their usage against the building average, their bills explained line by line, and a warning if their flat may have a leak.

If a code is lost or shared, the committee issues a new one, which switches off the old one immediately.

## Pricing

Per flat, per month:

| Starter · ₹10 | Society · ₹12 | Township · ₹15 |
| --- | --- | --- |
| Up to 150 flats | Up to 600 flats | Unlimited flats |
| Manual and spreadsheet readings | Smart-meter live alerts | Monthly summaries and questions |
| Usage-based billing | Shortage forecasts | Multiple committee admins |
| Leak alerts by email | Resident portal | Priority support |

**It pays for itself with one leak.** In the sample society, the leak in flat B-202 wastes about 481 litres a day, roughly ₹2,700 a month at tanker prices. That is more than a 40-flat society pays for AquaLedger in five months.

## Built on AWS

Everything is serverless and pay-per-use: nothing runs when nobody is using the app, so a quiet society costs almost nothing to host. At society scale it fits inside the AWS free tier.

| AWS service | What it does |
| --- | --- |
| **AWS Amplify** (Gen 2 and Hosting) | Builds and deploys the whole product from one codebase on every update, and serves the website. |
| **Amazon Cognito** | Committee sign-up and sign-in with email verification. Each society is its own access group. |
| **AWS AppSync** | The secure API between the website and the backend. |
| **Amazon DynamoDB** | Stores flats, meter readings, water supplies, tanker deliveries, bills, alerts and summaries. Every record is tagged with its society. |
| **AWS Lambda** | Runs the business logic: billing, leak detection, forecasting, resident access and smart-meter intake. |
| **Amazon EventBridge Scheduler** | Runs the leak scan automatically every night at 01:15 IST. |
| **Amazon SNS** | Emails leak and bill alerts to each society's committee. |
| **Amazon CloudWatch** | Logs, kept for one month. |
| *Optional:* **Amazon SES**, **AWS End User Messaging (WhatsApp)**, **AWS Budgets** | Emailed resident logins, automatic WhatsApp messages, and a spending alarm. Each is switched on with one setting. |

## Security and privacy

- **Isolation by society:** every record carries its society's ID, and access is checked on the server for every request.
- **Residents see one flat only:** an access code opens that flat and nothing else, and it can be revoked at any time.
- **Smart meters** need the society's secret device token. A wrong token is rejected before anything is saved, and the committee can rotate the token from Settings.
- **Data stays in India:** the backend runs in the AWS Mumbai region (ap-south-1).
- **Built-in health check:** **Settings → System check** tests the database, the nightly scan, alert emails, resident messaging and the meter endpoint, and explains how to fix anything that isn't green.

## Status

| | |
| --- | --- |
| **Live** | Deployed on AWS Amplify Hosting, with a 40-flat sample society available for evaluation. |
| **Works today** | Committee accounts, society setup, meter readings (manual, spreadsheet upload and smart meters), dashboard, nightly leak detection, live meter alerts, usage-based billing with printable bills, tanker forecast, plain-English questions, resident portal with WhatsApp and printed access slips. |
| **Next steps** | Pilot with 2–3 societies; automatic WhatsApp and email logins at scale (needs WhatsApp Business and Amazon SES production approval); integrations with smart-meter vendors; online bill payment. |

---

## For the technical team

### Try it without AWS (offline mode)

The whole app runs in the browser with 6 months of sample data, using the same leak, billing and forecast logic as the real backend:

```bash
npm install
npm run demo        # http://localhost:3000
```

### Architecture

```
Next.js (static export, Amplify Hosting)
   │  Cognito (committee email login, ADMINS / <societyId> groups; guest identity for residents)
   ▼
AppSync GraphQL ──► DynamoDB (Society, Flat, Reading, TankerDelivery, SourceSupply, Bill, Alert, Insight)
   │ custom queries/mutations
   ├─► admin-ops   Lambda: setupSociety, seedDemoData, issue/revoke/sendResidentAccess (SES email, WhatsApp), importReadingsCsv
   ├─► query-api   Lambda: getDashboard, getFlatDetail, askWaterData, residentPortal(code), systemCheck
   └─► analysis    Lambda: runAnalysis (leaks / billing / insights) ◄── EventBridge nightly schedule
                                                    └──► SNS topic ──► admin emails
Smart meter ──HTTPS──► meter-ingest Lambda (Function URL, device token) ──► DynamoDB + live alert + SNS
```

All analytics live in `lib/core/` as plain TypeScript with no AWS dependencies. The Lambdas and the UI share them, and they are covered by unit tests.

| Area | Where |
| --- | --- |
| Auth and multi-tenancy | `amplify/auth`, `amplify/data/resource.ts` |
| Leak detection (spike over 2.5 standard deviations and 30% above the 30-day normal; steady 2–4 a.m. flow on 3+ of 7 nights) | `lib/core/leak.ts` |
| Usage-based billing | `lib/core/billing.ts` |
| Forecast (3-month moving average × seasonal factor) | `lib/core/forecast.ts` |
| Sample data (40 flats, 6 months, planted leak in B-202) | `lib/core/seed.ts` |
| Smart-meter intake | `amplify/functions/meter-ingest`, `/live` |

### Deploy

Prerequisites: Node.js 20+, an AWS account, and the AWS CLI configured for one region (for example `ap-south-1`).

- **Development sandbox:** `npx ampx sandbox`, then `npm run dev`.
- **Amplify Hosting:** connect the GitHub repository in the Amplify console. `amplify.yml` deploys the backend and the website on every push. Full steps, settings and troubleshooting are in [docs/DEPLOY.md](docs/DEPLOY.md).

### Develop

```bash
npm test               # unit tests + end-to-end Lambda handler tests (in-memory DynamoDB)
npm run typecheck      # frontend + backend
npm run build          # static export to out/
npm run record:tour    # re-record the home-page tour video (needs ffmpeg)
npm run record:youtube # re-record the full product video (needs ffmpeg)
```

Spreadsheet import format (`flat, date, hour, litres`; leave `hour` empty for daily totals):

```csv
flat,date,hour,litres
A-101,2026-10-01,,412
B-202,2026-10-01,3,21.5
```

### Clean up

`npx ampx sandbox delete`, or delete the app in the Amplify console.

---

**Author:** Utkarsh Sonthalia

