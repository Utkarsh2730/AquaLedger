import { defineFunction } from "@aws-amplify/backend";
import { AI_ENV, LAMBDA_DEFAULTS } from "../shared/config";

export const queryApi = defineFunction({
  name: "query-api",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 1024,
  resourceGroupName: "data",
  environment: { CHAT_MODEL_ID: AI_ENV.CHAT_MODEL_ID, BEDROCK_REGION: AI_ENV.BEDROCK_REGION },
  ...LAMBDA_DEFAULTS,
});
