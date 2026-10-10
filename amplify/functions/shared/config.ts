/** shared Lambda settings: ARM is ~20% cheaper per GB-second, and logs expire instead of piling up */
export const LAMBDA_DEFAULTS = {
  architecture: "arm64" as const,
  runtime: 22 as const,
  logging: { format: "json" as const, retention: "1 month" as const },
};
