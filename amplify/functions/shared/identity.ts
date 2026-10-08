import type { AppSyncIdentityCognito } from "aws-lambda";
import { AdminGetUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

export const cognito = new CognitoIdentityProviderClient({});

export function groupsOf(identity: unknown): string[] {
  const claims = (identity as AppSyncIdentityCognito | null)?.claims ?? {};
  const g = claims["cognito:groups"] ?? (identity as AppSyncIdentityCognito | null)?.groups;
  if (!g) return [];
  return Array.isArray(g) ? g : String(g).split(",");
}

export function usernameOf(identity: unknown): string {
  const id = identity as AppSyncIdentityCognito | null;
  const u = id?.username ?? id?.sub;
  if (!u) throw new Error("Unauthorized: no Cognito identity");
  return u;
}

/** Admins of a society are members of the Cognito group named after its societyId. */
export function assertSocietyAdmin(identity: unknown, societyId: string) {
  if (!groupsOf(identity).includes(societyId)) {
    throw new Error("Unauthorized: you are not an admin of this society (sign out and in again if you just created it)");
  }
}

/** AppSync user-pool tokens may be access tokens (no email claim), so look the email up. */
export async function emailOf(identity: unknown): Promise<string> {
  const claimEmail = (identity as AppSyncIdentityCognito | null)?.claims?.email;
  if (claimEmail) return String(claimEmail).toLowerCase();
  const out = await cognito.send(new AdminGetUserCommand({ UserPoolId: process.env.USER_POOL_ID!, Username: usernameOf(identity) }));
  const email = out.UserAttributes?.find((a) => a.Name === "email")?.Value;
  if (!email) throw new Error("No email on this account");
  return email.toLowerCase();
}
