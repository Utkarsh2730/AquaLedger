import { defineFunction } from "@aws-amplify/backend";
import { LAMBDA_DEFAULTS } from "../shared/config";

export const analysis = defineFunction({
  name: "analysis",
  entry: "./handler.ts",
  timeoutSeconds: 120,
  memoryMB: 512,
  resourceGroupName: "data",
  // EventBridge schedule (free: 14M scheduler invocations/month). 19:45 UTC = 01:15 IST.
  // Every night: leak scan. On the 1st of the month it also bills the previous month and
  // writes the monthly summary.
  schedule: "45 19 * * ? *",
  ...LAMBDA_DEFAULTS,
});
