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
| **Bedrock** (optional) | AI monthly summary + "Ask your water data" chat | **Not free** — draws from credits | Off by default |

## Roadmap services this build swaps out (and why)

| Roadmap | This build | Why |
| --- | --- | --- |
| S3 CSV upload → Lambda parser | CSV sent straight to the `importReadingsCsv` mutation, parsed in Lambda | No bucket, no trigger, no IAM to debug; the admin auth check happens in the same call. (This is also the roadmap's own cut line.) |
| Bill PDFs rendered in Lambda, stored in S3 | Printable bill page; "Download PDF" uses the browser's print-to-PDF | No PDF library, no storage. Also a roadmap cut line. |
| SES emails | SNS email subscriptions with a `societyId` filter policy | SES starts in sandbox (verified recipients only) and is not always-free; SNS email is. Admins confirm one AWS email at sign-up. |
| SNS SMS | Email only | SMS is billed per message in every region. |
| IoT Core MQTT + rule | Lambda Function URL + device token header (Python simulator *and* an in-browser virtual meter) | Same live demo, no certificates or IoT policies. The roadmap's cut line says it "looks identical in the demo". Reserved concurrency is capped at 5 so a leaked token can't run up a bill. |
| Bedrock always on | Rule-based summaries + keyword chat by default; Claude on Bedrock is one setting away | Bedrock is the only service with a real per-call cost. |
| Next.js SSR on Amplify | Static export (`output: "export"`) | Every page is client-rendered against AppSync anyway; static hosting has no compute charge. |

## Turning on Claude via Bedrock (optional, uses credits)

1. In the Bedrock console for your region, enable access to the Anthropic models.
2. Set the model ids in the function resources and redeploy:
   - `amplify/functions/analysis/resource.ts` → `INSIGHT_MODEL_ID: "anthropic.claude-haiku-5-5"` (monthly summary, once per society per month)
   - `amplify/functions/query-api/resource.ts` → `CHAT_MODEL_ID: "anthropic.claude-sonnet-5-5"` (live chat)
3. The functions already have IAM permission. If a call fails or is refused, the app silently
   falls back to the rule-based answer, so the demo never breaks.

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
