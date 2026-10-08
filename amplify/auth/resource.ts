import { defineAuth } from "@aws-amplify/backend";

/**
 * Cognito user pool (free for the first 10,000 monthly active users on the Lite tier).
 *
 * Static groups say what kind of user someone is. Each society additionally gets its own
 * Cognito group named after its societyId (created by the admin-ops Lambda); the data
 * models use that group for row-level multi-tenancy.
 */
export const auth = defineAuth({
  loginWith: { email: true },
  groups: ["ADMINS", "RESIDENTS"],
  userAttributes: {
    preferredUsername: { mutable: true, required: false },
  },
});
