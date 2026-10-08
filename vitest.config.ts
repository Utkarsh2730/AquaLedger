import { defineConfig } from "vitest/config";

const tables = ["SOCIETY", "FLAT", "READING", "TANKER", "SUPPLY", "BILL", "ALERT", "INSIGHT"];

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "amplify/**/*.test.ts"],
    env: {
      ...Object.fromEntries(tables.map((t) => [`TABLE_${t}`, `${t}-table`])),
      USER_POOL_ID: "pool-1",
      AWS_REGION: "ap-south-1",
    },
  },
});
