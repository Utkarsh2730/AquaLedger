# Running AquaLedger on the AWS free tier

The roadmap budgets "a few dollars of $140 in credits". This build goes further: **with the
defaults, every service it uses sits inside AWS's always-free allowances or costs fractions of a
cent at hackathon scale.** Nothing is always-on, and nothing bills by the hour.

> AWS changed its free tier on 15 July 2025. New accounts get the **Free plan** (credits that
> expire, plus the always-free allowances below). Older accounts keep the 12-month free tier.
> Either way, check **Billing → Credits** and set the $20 Budgets alert from the roadmap.

## Service by service

| Service | What AquaLedger uses it for | Free allowance | Hackathon usage |
| --- | --- | --- | --- |
| Lambda | 4 functions: admin-ops, analysis, query-api, meter-ingest | Always free: 1M requests + 400k GB-s / month | A few thousand invocations |
| DynamoDB | 8 tables (on-demand) | Always free: 25 GB storage | ~15k items (~4 MB); on-demand reads/writes cost cents per million |
| Cognito | Sign-up, login, Admin/Resident + per-society groups | Always free: 10,000 MAU (Lite/Essentials) | A handful of users |
| AppSync | GraphQL API between app and data | Credits / 12-month free tier (250k ops) | A few thousand operations |
| EventBridge Scheduler | Nightly leak scan, monthly billing (1 schedule) | Always free: 14M invocations / month | 31 invocations |
| SNS | Leak + bill emails, filtered per society | Always free: 1M publishes, 1,000 email deliveries / month | Tens of emails |
| Lambda Function URL | Smart-meter ingest endpoint | No charge beyond Lambda | — |
| Amplify Hosting | Static Next.js export + CI/CD | Credits / 12-month free tier (1,000 build min, 15 GB served) | A few builds |
| CloudWatch Logs | Lambda logs | Always free: 5 GB ingest | Well under 1 GB |
| **Bedrock** | AI monthly summary + "Ask your water data" chat | **Not free**: draws from credits | On once model access is granted; well under ₹1 per answer. Set the models to `off` for $0 |
| AWS Budgets (optional) | Spending alarm at 80% / 100% of a monthly limit | First 2 budgets free | Set `AQUALEDGER_BUDGET_EMAIL` |

## Roadmap services this build swaps out (and why)

| Roadmap | This build | Why |
| --- | --- | --- |
| S3 CSV upload → Lambda parser | CSV sent straight to the `importReadingsCsv` mutation, parsed in Lambda | No bucket, no trigger, no IAM to debug; the admin auth check happens in the same call. (This is also the roadmap's own cut line.) |
| Bill PDFs rendered in Lambda, stored in S3 | Printable bill page; "Download PDF" uses the browser's print-to-PDF | No PDF library, no storage. Also a roadmap cut line. |
| SES emails | SNS email subscriptions with a `societyId` filter policy | SES starts in sandbox (verified recipients only) and is not always-free; SNS email is. Admins confirm one AWS email at sign-up. |
| SNS SMS | Email only | SMS is billed per message in every region. |
| IoT Core MQTT + rule | Lambda Function URL + device token header (Python simulator *and* an in-browser virtual meter) | Same live demo, no certificates or IoT policies. The roadmap's cut line says it "looks identical in the demo". A request with a wrong token is rejected before anything is written. |
| Bedrock always on | Claude on Bedrock when model access is granted, with automatic fallback to free rule-based answers; `off` switches it off entirely | Bedrock is the only service with a real per-call cost, and the demo must never break. |
| Next.js SSR on Amplify | Static export (`output: "export"`) | Every page is client-rendered against AppSync anyway; static hosting has no compute charge. |

## Claude via Bedrock (uses credits)

On by default: Claude Haiku writes the monthly summary, Claude Sonnet answers chat. Grant model
access once in the Bedrock console (see [DEPLOY.md](DEPLOY.md#3-turning-on-the-ai-claude-on-amazon-bedrock));
until then, and on any error, the app falls back to the rule-based answers and **Settings → System
check** shows why. Set `AQUALEDGER_CHAT_MODEL=off` and `AQUALEDGER_INSIGHT_MODEL=off` for a $0 build.

Other cost guards: Lambdas run on ARM (about 20% cheaper), logs expire after a month, and
`AQUALEDGER_BUDGET_EMAIL` adds a free AWS Budgets alarm.

The model only ever sees a compact facts object (~1-2k tokens: monthly totals, costs, top flats,
open alerts, forecast), never raw readings, so each chat answer costs a fraction of a rupee.

## Never create these (from the roadmap, still true)

OpenSearch Serverless, NAT gateways, VPC-attached Lambdas, RDS/Aurora, EC2, SageMaker endpoints.
None are used here.

## Clean up after the hackathon

```bash
npx ampx sandbox delete          # if you used a sandbox
# or delete the app in the Amplify console (removes all stacks, tables, user pool, topic)
```
