import { defineFunction } from "@aws-amplify/backend";
import { LAMBDA_DEFAULTS } from "../shared/config";

export const queryApi = defineFunction({
  name: "query-api",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 1024,
  resourceGroupName: "data",
  ...LAMBDA_DEFAULTS,
});
