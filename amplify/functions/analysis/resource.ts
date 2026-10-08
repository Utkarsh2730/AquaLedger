import { defineFunction } from "@aws-amplify/backend";

export const analysis = defineFunction({
  name: "analysis",
  entry: "./handler.ts",
  timeoutSeconds: 120,
  memoryMB: 512,
  resourceGroupName: "data",
  // EventBridge schedule (free: 14M scheduler invocations/month). 19:45 UTC = 01:15 IST.
  // Every night: leak scan + forecast. On the 1st of the month it also bills the previous
  // month and writes the monthly AI insight.
  schedule: "45 19 * * ? *",
  environment: {
    // Set to a Bedrock model id (e.g. "anthropic.claude-haiku-5-5") to turn on AI summaries.
    // Empty = free rule-based summaries.
    INSIGHT_MODEL_ID: "",
  },
});
