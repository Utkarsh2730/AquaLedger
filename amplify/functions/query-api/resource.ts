import { defineFunction } from "@aws-amplify/backend";

export const queryApi = defineFunction({
  name: "query-api",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 1024,
  resourceGroupName: "data",
  environment: {
    // Set to a Bedrock model id (e.g. "anthropic.claude-sonnet-5-5") to answer chat with AI.
    // Empty = free rule-based answers.
    CHAT_MODEL_ID: "",
  },
});
