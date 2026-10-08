import { a, defineData, type ClientSchema } from "@aws-amplify/backend";
import { adminOps } from "../functions/admin-ops/resource";
import { analysis } from "../functions/analysis/resource";
import { queryApi } from "../functions/query-api/resource";

/**
 * Multi-tenancy: every record carries societyId, and `allow.groupDefinedIn("societyId")`
 * lets only members of the Cognito group with that exact name (the society's admins) read or
 * write it. Residents never query these tables directly: the committee gives each flat an access
 * code, and the `residentPortal` query returns that one flat's view server-side.
 */


const schema = a
  .schema({
    ReadingSource: a.enum(["manual", "csv", "iot", "seed"]),
    SupplyType: a.enum(["municipal", "borewell"]),
    AlertType: a.enum(["spike", "night_flow", "live_spike"]),
    Severity: a.enum(["low", "medium", "high"]),
    BillStatus: a.enum(["draft", "issued", "paid"]),

    Society: a
      .model({
        societyId: a.id().required(),
        name: a.string().required(),
        city: a.string(),
        flatCount: a.integer(),
        /** fixed per-flat common-area charge in rupees */
        commonCharge: a.float(),
        tzOffsetMinutes: a.integer(),
        /** shared secret the meter simulator sends to the ingest URL */
        deviceToken: a.string(),
        adminEmails: a.string().array(),
        /** set by the scheduled job each night; the System check uses it to prove the schedule runs */
        lastNightlyScanAt: a.datetime(),
      })
      .identifier(["societyId"])
      .authorization((allow) => [allow.groupDefinedIn("societyId")]),

    Flat: a
      .model({
        societyId: a.id().required(),
        block: a.string().required(),
        number: a.string().required(),
        occupants: a.integer(),
        /** SHA-256 of the flat's resident access code (never the code itself); absent = no access issued */
        accessCodeHash: a.string(),
        accessIssuedAt: a.datetime(),
      })
      .secondaryIndexes((index) => [
        index("societyId").name("bySociety").queryField("listFlatsBySociety"),
        index("accessCodeHash").name("byAccessCode").queryField("listFlatsByAccessCode"),
      ])
      .authorization((allow) => [allow.groupDefinedIn("societyId")]),

    Reading: a
      .model({
        societyId: a.id().required(),
        flatId: a.id().required(),
        timestamp: a.datetime().required(),
        periodMinutes: a.integer().required(),
        litres: a.float().required(),
        source: a.ref("ReadingSource"),
      })
      .secondaryIndexes((index) => [
        index("societyId").sortKeys(["timestamp"]).name("bySocietyTime").queryField("listReadingsBySociety"),
        index("flatId").sortKeys(["timestamp"]).name("byFlatTime").queryField("listReadingsByFlat"),
      ])
      .authorization((allow) => [allow.groupDefinedIn("societyId")]),

    TankerDelivery: a
      .model({
        societyId: a.id().required(),
        vendor: a.string().required(),
        litres: a.float().required(),
        cost: a.float().required(),
        date: a.date().required(),
      })
      .secondaryIndexes((index) => [index("societyId").sortKeys(["date"]).name("bySocietyDate").queryField("listTankersBySociety")])
      .authorization((allow) => [allow.groupDefinedIn("societyId")]),

    SourceSupply: a
      .model({
        societyId: a.id().required(),
        type: a.ref("SupplyType").required(),
        litres: a.float().required(),
        cost: a.float().required(),
        date: a.date().required(),
      })
      .secondaryIndexes((index) => [index("societyId").sortKeys(["date"]).name("bySocietyDate").queryField("listSuppliesBySociety")])
      .authorization((allow) => [allow.groupDefinedIn("societyId")]),

    Bill: a
      .model({
        societyId: a.id().required(),
        flatId: a.id().required(),
        flatLabel: a.string(),
        month: a.string().required(),
        litres: a.float(),
        sharePct: a.float(),
        usageCharge: a.float(),
        commonCharge: a.float(),
        amount: a.float(),
        totalWaterCost: a.float(),
        status: a.ref("BillStatus"),
      })
      .secondaryIndexes((index) => [
        index("societyId").sortKeys(["month"]).name("bySocietyMonth").queryField("listBillsBySociety"),
        index("flatId").sortKeys(["month"]).name("byFlatMonth").queryField("listBillsByFlat"),
      ])
      .authorization((allow) => [allow.groupDefinedIn("societyId")]),

    Alert: a
      .model({
        societyId: a.id().required(),
        flatId: a.id().required(),
        flatLabel: a.string(),
        type: a.ref("AlertType").required(),
        severity: a.ref("Severity"),
        message: a.string(),
        detectedAt: a.datetime().required(),
        resolved: a.boolean(),
        wasteLitresPerDay: a.float(),
      })
      .secondaryIndexes((index) => [index("societyId").sortKeys(["detectedAt"]).name("bySocietyDetected").queryField("listAlertsBySociety")])
      .authorization((allow) => [allow.groupDefinedIn("societyId")]),

    Insight: a
      .model({
        societyId: a.id().required(),
        month: a.string().required(),
        summaryText: a.string(),
        forecast: a.json(),
        generatedBy: a.string(),
      })
      .secondaryIndexes((index) => [index("societyId").sortKeys(["month"]).name("bySocietyMonth").queryField("listInsightsBySociety")])
      .authorization((allow) => [allow.groupDefinedIn("societyId")]),

    // ---- custom operations (Lambda-backed) ----
    setupSociety: a
      .mutation()
      .arguments({
        name: a.string().required(),
        city: a.string(),
        blocks: a.string().array().required(),
        flatsPerBlock: a.integer().required(),
        commonCharge: a.float(),
        seedDemo: a.boolean(),
      })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(adminOps)),

    seedDemoData: a
      .mutation()
      .arguments({ societyId: a.id().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(adminOps)),

    issueResidentAccess: a
      .mutation()
      .arguments({ societyId: a.id().required(), flatId: a.id().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(adminOps)),

    revokeResidentAccess: a
      .mutation()
      .arguments({ societyId: a.id().required(), flatId: a.id().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(adminOps)),

    inviteAdmin: a
      .mutation()
      .arguments({ societyId: a.id().required(), email: a.email().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(adminOps)),

    importReadingsCsv: a
      .mutation()
      .arguments({ societyId: a.id().required(), csv: a.string().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(adminOps)),

    runAnalysis: a
      .mutation()
      .arguments({ societyId: a.id().required(), task: a.string().required(), month: a.string() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(analysis)),

    getDashboard: a
      .query()
      .arguments({ societyId: a.id().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(queryApi)),

    getFlatDetail: a
      .query()
      .arguments({ societyId: a.id().required(), flatId: a.id().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(queryApi)),

    askWaterData: a
      .query()
      .arguments({ societyId: a.id().required(), question: a.string().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(queryApi)),

    systemCheck: a
      .query()
      .arguments({ societyId: a.id().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(queryApi)),

    // residents have no account: the access code is the credential (guest = Cognito identity pool)
    residentPortal: a
      .query()
      .arguments({ code: a.string().required() })
      .returns(a.json())
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(queryApi)),
  });

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: "userPool" },
});
