import { defineFunction } from "@aws-amplify/backend";

export const adminOps = defineFunction({
  name: "admin-ops",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  // lives in the data stack: it reads/writes the model tables directly (avoids a circular dependency)
  resourceGroupName: "data",
});
