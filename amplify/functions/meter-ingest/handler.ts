import { randomUUID, timingSafeEqual } from "node:crypto";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { detectLiveSpike } from "../../../lib/core/leak";
import { round } from "../../../lib/core/aggregate";
import { flatLabel } from "../../../lib/core/types";
import { getSociety, listAlerts, listFlatReadings, listFlats, putItem } from "../shared/db";
import { notify } from "../shared/notify";

/**
 * POST { societyId, flat: "B-202", litres, periodMinutes?: 1, timestamp?: ISO }
 * Header: x-device-token: <society device token>
 *
 * Stores the reading and, if the flow rate is far above the flat's normal rate, raises a
 * live_spike alert + email within seconds. This is the live leak demo.
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  if (event.requestContext.http.method === "OPTIONS") return { statusCode: 204 };
  // public endpoint: reject anything that can't be a meter reading before touching the database
  if ((event.body?.length ?? 0) > 4096) return json(413, { error: "Request too large" });
  try {
    const body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString() : event.body ?? "{}");
    const { societyId, flat: label, litres } = body;
    const periodMinutes = Number(body.periodMinutes ?? 1);
    if (!societyId || !label || !Number.isFinite(Number(litres)) || Number(litres) < 0 || periodMinutes <= 0 || periodMinutes > 1440) {
      return json(400, { error: "Expected { societyId, flat, litres, periodMinutes? }" });
    }

    // no household tap or burst pipe delivers more than ~200 L/min through a domestic meter
    if (Number(litres) / periodMinutes > 200) return json(400, { error: "Implausible flow rate" });
    if (body.timestamp !== undefined) {
      const t = Date.parse(body.timestamp);
      if (Number.isNaN(t) || t > Date.now() + 5 * 60_000 || t < Date.now() - 24 * 3_600_000) {
        return json(400, { error: "timestamp must be a valid time within the last 24 hours" });
      }
    }

    const society = await getSociety(String(societyId));
    const token = event.headers["x-device-token"] ?? "";
    if (!society?.deviceToken || !safeEqual(token, society.deviceToken)) return json(401, { error: "Bad device token" });

    const flats = await listFlats(societyId);
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const flat = flats.find((f) => norm(flatLabel(f)) === norm(String(label)));
    if (!flat) return json(404, { error: `Unknown flat ${label}` });

    const timestamp = body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString();
    await putItem("Reading", { id: randomUUID(), societyId, flatId: flat.id, timestamp, periodMinutes, litres: Number(litres), source: "iot" });

    // Baseline: the flat's average flow rate over the last 7 days, ignoring live ticks.
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const history = (await listFlatReadings(flat.id, weekAgo)).filter((r) => r.source !== "iot");
    const baseline = history.reduce((a, r) => a + r.litres, 0) / (7 * 1440);
    const spike = detectLiveSpike(Number(litres), periodMinutes, baseline);
    if (!spike) return json(200, { ok: true, alert: null, rate: round(Number(litres) / periodMinutes, 2) });

    // One live alert per flat per 30 minutes.
    const recent = await listAlerts(societyId, new Date(Date.now() - 30 * 60_000).toISOString());
    if (recent.some((a) => a.flatId === flat.id && a.type === "live_spike" && !a.resolved)) {
      return json(200, { ok: true, alert: "already-open", rate: spike.rate });
    }
    const message = `${flatLabel(flat)} is drawing ${spike.rate} L/min right now, ${spike.ratio}x its normal rate. Possible burst pipe or open tap.`;
    await putItem("Alert", {
      id: randomUUID(),
      societyId,
      flatId: flat.id,
      flatLabel: flatLabel(flat),
      type: "live_spike",
      severity: spike.severity,
      message,
      detectedAt: new Date().toISOString(),
      resolved: false,
    });
    await notify(societyId, `AquaLedger LIVE: abnormal flow at ${flatLabel(flat)}`, `${message}\n\nSociety: ${society.name}`);
    return json(200, { ok: true, alert: message, rate: spike.rate });
  } catch (err) {
    console.error(err);
    return json(500, { error: "Internal error" });
  }
};

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
