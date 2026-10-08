import { defineFunction } from "@aws-amplify/backend";
import { LAMBDA_DEFAULTS } from "../shared/config";

/**
 * Public HTTPS endpoint (Lambda Function URL, no API Gateway cost) that smart meters and the
 * simulator post readings to. Replaces IoT Core for the free-tier build; see docs/AWS_FREE_TIER.md.
 */
export const meterIngest = defineFunction({
  name: "meter-ingest",
  entry: "./handler.ts",
  timeoutSeconds: 10,
  memoryMB: 256,
  resourceGroupName: "data",
  ...LAMBDA_DEFAULTS,
});
