import { defineFunction } from "@aws-amplify/backend";
import { AI_ENV, LAMBDA_DEFAULTS } from "../shared/config";

export const analysis = defineFunction({
  name: "analysis",
  entry: "./handler.ts",
  timeoutSeconds: 120,
  memoryMB: 512,
  resourceGroupName: "data",
  // EventBridge schedule (free: 14M scheduler invocations/month). 19:45 UTC = 01:15 IST.
  // Every night: leak scan. On the 1st of the month it also bills the previous month and
  // writes the monthly AI insight.
  schedule: "45 19 * * ? *",
  environment: { INSIGHT_MODEL_ID: AI_ENV.INSIGHT_MODEL_ID, BEDROCK_REGION: AI_ENV.BEDROCK_REGION },
  ...LAMBDA_DEFAULTS,
});
