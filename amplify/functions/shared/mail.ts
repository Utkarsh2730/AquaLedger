import { GetAccountCommand, GetEmailIdentityCommand, SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

/**
 * Resident access emails go through Amazon SES (free tier: 3,000 messages a month for the first
 * 12 months, then $0.10 per 1,000). The sender is AQUALEDGER_SENDER_EMAIL, verified at deploy time.
 * Alerts to admins keep using SNS (see notify.ts).
 */
export const ses = new SESv2Client({});
export const senderEmail = () => process.env.SENDER_EMAIL || "";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendEmail(to: string, m: { subject: string; text: string; html: string }) {
  if (!senderEmail()) throw new Error("Email sending isn't set up");
  for (let attempt = 0; ; attempt++) {
    try {
      await ses.send(
        new SendEmailCommand({
          FromEmailAddress: `AquaLedger <${senderEmail()}>`,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: m.subject, Charset: "UTF-8" },
              Body: { Text: { Data: m.text, Charset: "UTF-8" }, Html: { Data: m.html, Charset: "UTF-8" } },
            },
          },
        })
      );
      return;
    } catch (err) {
      // the SES sandbox allows 1 email a second: wait and retry instead of failing the batch
      const e = err as { name?: string; message?: string };
      if (attempt < 3 && (e.name === "TooManyRequestsException" || /rate exceeded|throttl/i.test(e.message ?? ""))) {
        await sleep(1100 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

/** Readable reason for a failed send, with the fix when it's a setup problem */
export function explainSendError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  const msg = e.message ?? String(err);
  if (/not verified/i.test(msg)) {
    // SES lists the unverified identities: the sender itself, or (in the sandbox) the recipient
    return msg.toLowerCase().includes(senderEmail().toLowerCase())
      ? "The sender address isn't verified yet: click the link in the email from Amazon SES."
      : "Amazon SES is still in sandbox mode, so it only sends to verified addresses. Request production access (see Settings → System check).";
  }
  return `${e.name ?? "Error"}: ${msg.slice(0, 200)}`;
}

/** For the System check: is the sender verified, and is the account out of the SES sandbox? */
export async function mailStatus() {
  const [identity, account] = await Promise.all([
    ses.send(new GetEmailIdentityCommand({ EmailIdentity: senderEmail() })).catch((err) => ({ error: err as Error })),
    ses.send(new GetAccountCommand({})),
  ]);
  return {
    verified: "error" in identity ? false : Boolean(identity.VerifiedForSendingStatus),
    production: Boolean(account.ProductionAccessEnabled),
    max24h: account.SendQuota?.Max24HourSend,
    sent24h: account.SendQuota?.SentLast24Hours,
  };
}
