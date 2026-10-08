/**
 * Deploy-time settings, read when the backend is synthesized (`npx ampx sandbox` in your shell, or
 * the Amplify Hosting build's environment variables). Change them without editing code:
 *
 *   AQUALEDGER_CHAT_MODEL      Bedrock model for "Ask your water data"  (default anthropic.claude-sonnet-5-5)
 *   AQUALEDGER_INSIGHT_MODEL   Bedrock model for monthly summaries      (default anthropic.claude-haiku-5-5)
 *   AQUALEDGER_BEDROCK_REGION  region to call Bedrock in                (default us-east-1)
 *
 * Set a model to "off" to use the free rule-based answers instead.
 */
const env = (name: string, fallback: string) => (process.env[name] ?? "").trim() || fallback;

export const AI_ENV = {
  CHAT_MODEL_ID: env("AQUALEDGER_CHAT_MODEL", "anthropic.claude-sonnet-5-5"),
  INSIGHT_MODEL_ID: env("AQUALEDGER_INSIGHT_MODEL", "anthropic.claude-haiku-5-5"),
  BEDROCK_REGION: env("AQUALEDGER_BEDROCK_REGION", "us-east-1"),
};

/** shared Lambda settings: ARM is ~20% cheaper per GB-second, and logs expire instead of piling up */
export const LAMBDA_DEFAULTS = {
  architecture: "arm64" as const,
  runtime: 22 as const,
  logging: { format: "json" as const, retention: "1 month" as const },
};
