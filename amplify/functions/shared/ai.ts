import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import type { Facts } from "../../../lib/core/insights";

/**
 * Optional Bedrock (Claude) layer. Bedrock is NOT part of the AWS free tier, so it is off
 * unless a model id is configured; every caller has a free rule-based fallback.
 * Cost guardrails: the model only ever sees the compact facts JSON (a few hundred tokens),
 * monthly insights are generated once and stored, and only chat calls the model live.
 */
let client: AnthropicBedrockMantle | undefined;
const getClient = () => (client ??= new AnthropicBedrockMantle({ awsRegion: process.env.AWS_REGION }));

const SYSTEM = `You are AquaLedger's water analyst for an Indian apartment society. You are given a JSON
object of facts (litres, kL, rupees). Answer only from these facts; if they don't contain the answer,
say what data is missing. Be concise and concrete: name months, flats and rupee amounts. Use ₹ and kL.`;

export async function askModel(modelId: string | undefined, facts: Facts, question: string): Promise<string | null> {
  if (!modelId) return null;
  try {
    const res = await getClient().messages.create({
      model: modelId,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: `Facts:\n${JSON.stringify(facts)}\n\nQuestion: ${question}` }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return text || null;
  } catch (err) {
    console.error("Bedrock call failed, using rule-based fallback", err);
    return null;
  }
}
