import { defineBackend } from "@aws-amplify/backend";
import { Duration, Stack } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sns from "aws-cdk-lib/aws-sns";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { adminOps } from "./functions/admin-ops/resource";
import { analysis } from "./functions/analysis/resource";
import { queryApi } from "./functions/query-api/resource";
import { meterIngest } from "./functions/meter-ingest/resource";

/**
 * AquaLedger backend. Everything here is serverless and pay-per-use, chosen to stay inside the
 * AWS free tier at hackathon scale (see docs/AWS_FREE_TIER.md). Nothing is always-on.
 */
const backend = defineBackend({ auth, data, adminOps, analysis, queryApi, meterIngest });

const tables = backend.data.resources.tables;
const userPool = backend.auth.resources.userPool;
const dataStack = Stack.of(backend.data);

// One SNS topic for every alert/bill email; subscriptions filter on societyId.
const alertsTopic = new sns.Topic(dataStack, "AquaLedgerAlerts", { displayName: "AquaLedger" });

const fns = {
  adminOps: backend.adminOps.resources.lambda as lambda.Function,
  analysis: backend.analysis.resources.lambda as lambda.Function,
  queryApi: backend.queryApi.resources.lambda as lambda.Function,
  meterIngest: backend.meterIngest.resources.lambda as lambda.Function,
};

const tableEnv: Record<string, string> = {
  TABLE_SOCIETY: "Society",
  TABLE_FLAT: "Flat",
  TABLE_READING: "Reading",
  TABLE_TANKER: "TankerDelivery",
  TABLE_SUPPLY: "SourceSupply",
  TABLE_BILL: "Bill",
  TABLE_ALERT: "Alert",
  TABLE_INSIGHT: "Insight",
};

for (const fn of Object.values(fns)) {
  for (const [envName, model] of Object.entries(tableEnv)) {
    fn.addEnvironment(envName, tables[model].tableName);
    tables[model].grantReadWriteData(fn);
  }
  fn.addEnvironment("USER_POOL_ID", userPool.userPoolId);
  fn.addEnvironment("ALERTS_TOPIC_ARN", alertsTopic.topicArn);
  alertsTopic.grantPublish(fn);
}

// admin-ops manages Cognito groups/users and subscribes admin emails to the alerts topic.
fns.adminOps.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["cognito-idp:CreateGroup", "cognito-idp:AdminAddUserToGroup", "cognito-idp:AdminCreateUser", "cognito-idp:AdminGetUser"],
    resources: [userPool.userPoolArn],
  })
);
fns.adminOps.addToRolePolicy(new iam.PolicyStatement({ actions: ["sns:Subscribe"], resources: [alertsTopic.topicArn] }));
fns.queryApi.addToRolePolicy(new iam.PolicyStatement({ actions: ["cognito-idp:AdminGetUser"], resources: [userPool.userPoolArn] }));

// Optional Bedrock access. Unused (and free) unless INSIGHT_MODEL_ID / CHAT_MODEL_ID are set.
for (const fn of [fns.analysis, fns.queryApi]) {
  fn.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock-mantle:*"],
      resources: ["*"],
    })
  );
}

// Public HTTPS endpoint for the meter simulator (auth = per-society device token in a header).
const ingestUrl = fns.meterIngest.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ["*"],
    allowedMethods: [lambda.HttpMethod.POST],
    allowedHeaders: ["content-type", "x-device-token"],
    maxAge: Duration.hours(1),
  },
});
// No reserved concurrency here: new accounts have a 10-execution limit and AWS rejects any
// reservation that leaves fewer than 10 unreserved. A bad device token is rejected before any
// database write, and Lambda's free tier covers 1M requests a month.

backend.addOutput({
  custom: {
    meterIngestUrl: ingestUrl.url,
    alertsTopicArn: alertsTopic.topicArn,
  },
});
