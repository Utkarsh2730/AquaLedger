import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import type { Facts } from "../../../lib/core/insights";

/**
 * Claude on Amazon Bedrock. Bedrock is not part of the AWS free tier, so every caller has a free
 * rule-based fallback, and a failure (model access not granted yet, wrong region, throttling)
 * never breaks the app: the error is returned so the UI and the System check can show it.
 * Cost guardrails: the model only sees the compact facts JSON (~1-2k tokens), monthly insights
 * are written once and stored, and only chat calls the model live.
 */
let client: AnthropicBedrockMantle | undefined;
const getClient = () => (client ??= new AnthropicBedrockMantle({ awsRegion: process.env.BEDROCK_REGION || process.env.AWS_REGION }));

export const aiEnabled = (modelId: string | undefined): modelId is string => Boolean(modelId && modelId !== "off");

const SYSTEM = `You are AquaLedger's water analyst for an Indian apartment society. You are given a JSON
object of facts (litres, kL, rupees). Answer only from these facts; if they don't contain the answer,
say what data is missing. Be concise and concrete: name months, flats and rupee amounts. Use ₹ and kL.`;

export interface AiResult {
  text: string | null;
  /** why the model wasn't used (absent when AI is simply switched off) */
  error?: string;
}

async function call(modelId: string, system: string, prompt: string, maxTokens: number): Promise<AiResult> {
  try {
    const res = await getClient().messages.create({
      model: modelId,
      max_tokens: maxTokens,
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") return { text: null, error: "The model declined this request" };
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return text ? { text } : { text: null, error: "The model returned no text" };
  } catch (err) {
    const e = err as { status?: number; name?: string; message?: string };
    console.error("Bedrock call failed, using rule-based fallback", err);
    return { text: null, error: `${e.status ? `HTTP ${e.status} ` : ""}${e.name ?? "Error"}: ${(e.message ?? String(err)).slice(0, 300)}` };
  }
}

export async function askModel(modelId: string | undefined, facts: Facts, question: string): Promise<AiResult> {
  if (!aiEnabled(modelId)) return { text: null };
  return call(modelId, SYSTEM, `Facts:\n${JSON.stringify(facts)}\n\nQuestion: ${question}`, 2000);
}

/** tiny round trip for the System check: proves model access, region and IAM in one call */
export async function pingModel(modelId: string): Promise<AiResult> {
  return call(modelId, "Reply with exactly: OK", "ping", 200);
}
