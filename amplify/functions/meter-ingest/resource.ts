import { defineFunction } from "@aws-amplify/backend";

/**
 * Public HTTPS endpoint (Lambda Function URL, no API Gateway cost) that the meter simulator
 * posts readings to. Replaces IoT Core for the free-tier build; see docs/AWS_FREE_TIER.md.
 */
export const meterIngest = defineFunction({
  name: "meter-ingest",
  entry: "./handler.ts",
  timeoutSeconds: 10,
  memoryMB: 256,
  resourceGroupName: "data",
});
