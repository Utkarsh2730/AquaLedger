# Deploying AquaLedger

Two ways to run the backend on your AWS account. Use the **sandbox** while building, and
**Amplify Hosting** for the public URL you give judges. They are separate copies of the backend
(separate logins and data), so create your demo society on the hosted one too.

## 1. Live URL with Amplify Hosting

One-time setup in the AWS console (region **Asia Pacific (Mumbai) ap-south-1**):

1. Open **AWS Amplify → Create new app → GitHub**, authorize, and pick
   `Utkarsh2730/AquaLedger` and the `main` branch.
2. **App settings / build settings:** Amplify reads `amplify.yml` from the repo. Leave it as is.
3. **Service role:** choose *Create and use a new service role*. If the console doesn't offer it,
   create one afterwards (step 6) before the first build finishes.
4. **Environment variables** (optional, under *Advanced settings*), see the table below.
5. **Save and deploy.** The first build takes 10-20 minutes: *Backend* (creates Cognito, AppSync,
   DynamoDB, Lambdas, SNS, the nightly schedule) then *Frontend* (builds the static site).
6. If the backend step fails with a credentials or `ssm:GetParameter` error: **App settings → IAM
   roles → Service role → Edit → Create new service role** (keep `AmplifyBackendDeployFullAccess`),
   save, then **Redeploy this version**.
7. If the build is green but every page is a 404, the app was created as a server-side app. Run
   `aws amplify update-app --app-id <app id> --platform WEB --region ap-south-1` and redeploy.

Your URL is shown on the branch, like `https://<branch>.<app-id>.amplifyapp.com`. Every push to
that branch redeploys it.

Then, on the live URL: sign up, create the society with demo data, confirm the AWS subscription
email, and open **Settings → System check**. All rows should be ✅ or explain what's left.

## 2. Settings (environment variables)

Set them in your terminal before `npx ampx sandbox`, or in **Amplify → Hosting → Environment
variables** for the live app, then redeploy.

| Variable | Default | What it does |
| --- | --- | --- |
| `AQUALEDGER_CHAT_MODEL` | `anthropic.claude-sonnet-5-5` | Model for "Ask your water data". `off` = free rule-based answers |
| `AQUALEDGER_INSIGHT_MODEL` | `anthropic.claude-haiku-5-5` | Model for the monthly summary. `off` = free rule-based summary |
| `AQUALEDGER_BEDROCK_REGION` | `us-east-1` | Region the Bedrock calls go to |
| `AQUALEDGER_SENDER_EMAIL` | (unset) | Turns on **emailing residents their login** (Amazon SES) from this address. See section 4 |
| `AQUALEDGER_WHATSAPP_PHONE_ID` | (unset) | Turns on **automatic WhatsApp logins** from a WhatsApp Business number (`phone-number-id-…`). Without it, the committee sends them in one tap each. See section 4 |
| `AQUALEDGER_WHATSAPP_REGION` | app's region | Region where that WhatsApp number is linked in AWS End User Messaging Social |
| `AQUALEDGER_WHATSAPP_TEMPLATE` / `_LANGUAGE` | `aqualedger_login` / `en` | Use your own approved template instead (same 4 variables: society, flat, code, link) |
| `AQUALEDGER_BUDGET_EMAIL` | (unset) | If set, creates a monthly AWS Budget that emails you at 80% and 100% |
| `AQUALEDGER_BUDGET_USD` | `10` | Budget amount in USD |

Example (sandbox, macOS):

```bash
export AQUALEDGER_BUDGET_EMAIL=you@example.com
npx ampx sandbox
```

## 3. Turning on the AI (Claude on Amazon Bedrock)

The AI is on by default, but Bedrock only answers once your account has access to the models.
Until then the app uses the free rule-based answers and the System check tells you what's missing.

1. In the AWS console, switch the region to **US East (N. Virginia) us-east-1** (or the region you
   set in `AQUALEDGER_BEDROCK_REGION`).
2. Open **Amazon Bedrock → Model access → Modify model access**, select the **Anthropic** models
   (Claude Sonnet and Claude Haiku), fill in the short use-case form, and submit. Approval is
   usually a few minutes.
3. Back in the app: **Settings → System check → Run check**. Both AI rows should turn ✅. In
   **Forecast & AI**, answers now say "answered by Claude on Bedrock".

Cost: the model only sees a compact summary of your data (~1-2k tokens). A chat answer costs well
under ₹1; the monthly summary is written once a month per society.

## 4. Sending residents their login (email and WhatsApp)

Committee members sign in with email and password. Residents don't have accounts. On **Flats → Send
residents their login**, the committee pastes or uploads its resident list
(`A-101, rahul@gmail.com, 98765 43210`). AquaLedger then sends every flat its login (the flat number
plus a private access code, with a one-tap link) to each email and mobile number on file.

**Give access to all flats** does every flat in one click. Flats with an email or mobile on file are
sent their login. The committee gets a sheet of every new code, to **Download CSV**, **Print slips**
(two per row, to cut out and drop in letterboxes), or **Copy all**. Codes are stored only as hashes,
so save or print the sheet before leaving the page.

### WhatsApp

**Works with no setup (free):** after **Send logins**, AquaLedger lists every mobile number with an
**Open WhatsApp** button. Each tap opens WhatsApp on the committee member's phone or computer, with
the resident's number and the login message already filled in; press send. A **Next →** button steps
through the list.

**Automatic (optional):** messages go out from your society's own WhatsApp Business number, with no
taps. This uses the WhatsApp Business Platform through **AWS End User Messaging Social**:

1. You need a Meta Business account and a phone number not already used on WhatsApp. In the AWS
   console open **AWS End User Messaging Social → Add WhatsApp phone number**, and follow the Meta
   sign-up it opens (business verification can take a few days for new businesses).
2. Copy the number's **Phone number ID** (`phone-number-id-…`) and deploy with it:
   ```bash
   export AQUALEDGER_WHATSAPP_PHONE_ID=phone-number-id-0123456789abcdef
   export AQUALEDGER_WHATSAPP_REGION=ap-south-1   # where you linked the number, if different
   npx ampx sandbox
   ```
3. Open **Settings → System check**. The first run submits the `aqualedger_login` message template to
   Meta for review, because WhatsApp requires an approved template for messages a business starts.
   Approval is usually minutes to a day. Run the check again until it's ✅.
4. Until the template is approved, or for any number WhatsApp rejects, AquaLedger falls back to the
   one-tap buttons, so no flat is left without its login.

Cost: Meta charges per message (utility category; in India roughly ₹0.1–0.2 each at the time of
writing), and AWS adds $0.005 per message. This is not covered by the free tier, but it amounts to a
few rupees for a whole society. One-tap mode is free.

### Email (Amazon SES)

1. Pick the address emails come from, for example your society's Gmail, and deploy with it:
   ```bash
   export AQUALEDGER_SENDER_EMAIL=greenmeadows.committee@gmail.com
   npx ampx sandbox
   ```
2. AWS emails that address a verification link ("Amazon Web Services – Email Address Verification
   Request"). Click it.
3. New AWS accounts start in the **SES sandbox**, which only delivers to verified addresses (fine for
   testing with your own emails). To email real residents, open **Amazon SES → Account dashboard →
   Request production access** in the same region as the app. Choose *Transactional*, and describe
   it as "login emails to residents of housing societies, sent by their committee". Approval
   usually takes about a day.
4. **Settings → System check** shows which of these steps is still missing.

Cost: SES includes 3,000 emails a month free for the first 12 months, then $0.10 per 1,000.

## 5. Checking the live backend

**Settings → System check** tests, from inside your AWS account:

| Check | Passes when |
| --- | --- |
| Database | flats exist and readings arrived in the last 7 days |
| Nightly leak scan | the scheduled job ran in the last 26 h (it runs at 01:15 IST) |
| Alert emails | every admin has confirmed the AWS subscription email |
| Resident access emails | the sender address is verified and SES is out of the sandbox (warns while not set up) |
| Resident WhatsApp | one-tap mode, or the WhatsApp Business number is linked and the login template is approved (submits it if missing) |
| Smart-meter endpoint | the public meter URL is reachable and rejects a wrong device token |
| AI answers / summaries | Bedrock answers a test prompt with the configured model and region |

Every ⚠️ or ❌ comes with the fix. **Copy results** puts the whole report on your clipboard.
