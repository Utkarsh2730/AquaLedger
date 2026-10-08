/**
 * Is the deployed AWS backend as new as this app? amplify_outputs.json (written by
 * `npx ampx sandbox` / the Amplify build) lists every query, mutation and model field the backend
 * has. When the code is updated but the backend wasn't redeployed, the app would call operations
 * that don't exist yet and fail in confusing ways; this lets it say "update your backend" instead.
 */

/** What this version of the app calls: operations (with their newer arguments) and model fields. */
export const REQUIRED_BACKEND = {
  queries: {
    getDashboard: [],
    getFlatDetail: [],
    askWaterData: [],
    systemCheck: [],
    residentPortal: ["code"],
  },
  mutations: {
    setupSociety: [],
    seedDemoData: [],
    issueResidentAccess: [],
    sendResidentAccess: ["includeUncontacted", "returnCodes"],
    revokeResidentAccess: [],
    inviteAdmin: [],
    importReadingsCsv: [],
    runAnalysis: [],
  },
  models: {
    Society: ["lastNightlyScanAt"],
    Flat: ["accessCodeHash", "accessIssuedAt", "residentEmails", "residentPhones"],
  },
} as const;

type Ops = Record<string, { arguments?: Record<string, unknown> | null } | undefined>;
export interface ModelIntrospection {
  queries?: Ops;
  mutations?: Ops;
  models?: Record<string, { fields?: Record<string, unknown> } | undefined>;
}

/**
 * The features this app needs that the backend lacks, e.g. "sendResidentAccess (includeUncontacted)".
 * Empty = up to date. null = can't tell (no introspection in the outputs file).
 */
export function missingBackendFeatures(mi: ModelIntrospection | null | undefined): string[] | null {
  if (!mi || (!mi.queries && !mi.mutations && !mi.models)) return null;
  const missing: string[] = [];
  for (const kind of ["queries", "mutations"] as const) {
    for (const [name, args] of Object.entries(REQUIRED_BACKEND[kind])) {
      const op = mi[kind]?.[name];
      if (!op) missing.push(name);
      else {
        const lacking = (args as readonly string[]).filter((a) => !op.arguments || !(a in op.arguments));
        if (lacking.length) missing.push(`${name} (${lacking.join(", ")})`);
      }
    }
  }
  for (const [model, fields] of Object.entries(REQUIRED_BACKEND.models)) {
    const have = mi.models?.[model]?.fields;
    const lacking = (fields as readonly string[]).filter((f) => !have || !(f in have));
    if (lacking.length) missing.push(`${model}.${lacking.join(`, ${model}.`)}`);
  }
  return missing;
}
