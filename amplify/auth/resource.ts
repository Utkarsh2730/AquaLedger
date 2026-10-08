import { defineAuth } from "@aws-amplify/backend";

/**
 * Cognito user pool (free for the first 10,000 monthly active users on the Lite tier).
 *
 * Only committee members have accounts; residents use a per-flat access code instead. Each
 * society gets its own Cognito group named after its societyId (created by the admin-ops Lambda); the data
 * models use that group for row-level multi-tenancy.
 */
export const auth = defineAuth({
  loginWith: { email: true },
  groups: ["ADMINS"],
  userAttributes: {
    preferredUsername: { mutable: true, required: false },
  },
});
