import { ListSubscriptionsByTopicCommand, PublishCommand, SNSClient, SubscribeCommand } from "@aws-sdk/client-sns";

/**
 * Alerts go out through one SNS topic (free tier: 1,000 email deliveries/month). Each society
 * admin's email subscription carries a filter policy on societyId, so a society only
 * receives its own alerts. SES is not needed.
 */
export const sns = new SNSClient({});
const topicArn = () => process.env.ALERTS_TOPIC_ARN;

export async function subscribeAdminEmail(societyId: string, email: string) {
  if (!topicArn()) return;
  await sns.send(
    new SubscribeCommand({
      TopicArn: topicArn(),
      Protocol: "email",
      Endpoint: email,
      Attributes: { FilterPolicy: JSON.stringify({ societyId: [societyId] }) },
    })
  );
}

/** email -> "confirmed" | "pending" | "missing", for the System check */
export async function subscriptionStatus(emails: string[]): Promise<Record<string, "confirmed" | "pending" | "missing"> | null> {
  if (!topicArn()) return null;
  const found = new Map<string, "confirmed" | "pending">();
  let NextToken: string | undefined;
  do {
    const page = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: topicArn(), NextToken }));
    for (const s of page.Subscriptions ?? []) {
      if (s.Protocol !== "email" || !s.Endpoint) continue;
      const state = s.SubscriptionArn?.startsWith("arn:") ? "confirmed" : "pending";
      const key = s.Endpoint.toLowerCase();
      if (found.get(key) !== "confirmed") found.set(key, state);
    }
    NextToken = page.NextToken;
  } while (NextToken);
  return Object.fromEntries(emails.map((e) => [e, found.get(e.toLowerCase()) ?? "missing"]));
}

export async function notify(societyId: string, subject: string, message: string) {
  if (!topicArn()) return;
  try {
    await sns.send(
      new PublishCommand({
        TopicArn: topicArn(),
        Subject: subject.slice(0, 99),
        Message: message,
        MessageAttributes: { societyId: { DataType: "String", StringValue: societyId } },
      })
    );
  } catch (err) {
    // a failed email must never fail the analysis or the ingest
    console.error("SNS publish failed", err);
  }
}
