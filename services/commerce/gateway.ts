/**
 * Commerce gateway orchestration — TypeScript port of the `gateway.py` request
 * flow, made CRM-aware. This is the single entry point the A2A/MCP layer calls
 * to turn an identified agent action into a scored, rule-governed decision.
 *
 * Flow:
 *   1. Score the request (reputation: CRM LTV + intent + behavior + signature).
 *   2. If the (mock) signature failed -> REJECTED.
 *   3. Otherwise look up the reputation segment + curated CRM segment and run
 *      the CRM-aware rules engine to get the commercial treatment.
 *   4. Build a commercial_context block for PREMIUM agents.
 *   5. Persist the transaction for the dashboard's live analytics.
 */
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { agentCrm, crmProfiles, transactions } from "@/db/commerce/schema";
import { evaluateRules } from "./rules";
import { scoreRequest } from "./reputation";
import type {
  AgentRequest,
  CommercialContext,
  Decision,
  RuleTreatment,
  ScoreBreakdown,
} from "./types";

export interface GatewayResponse {
  id: string;
  did: string;
  rank: number;
  decision: Decision;
  breakdown: ScoreBreakdown;
  commercialContext: CommercialContext | null;
  appliedRules: string[];
  result: Record<string, unknown>;
  servedAt: string;
}

function buildCommercialContext(t: RuleTreatment): CommercialContext {
  return {
    tier: t.tier,
    targetedDiscountPct: t.discountPct,
    bindingTimeSeconds: t.bindingTimeSeconds,
    negotiationToken: `neg_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    message:
      t.message ||
      "Verified agent. Targeted pricing unlocked per commercial policy.",
  };
}

/**
 * Evaluate an identified agent request end-to-end. Returns the full decision
 * envelope and writes a transaction row. The caller (MCP tool) decides how to
 * act on the decision (e.g. throttle, surface offers, allow the action).
 */
export async function evaluateAgentRequest(
  request: AgentRequest,
): Promise<GatewayResponse> {
  const { breakdown } = await scoreRequest(request);

  let decision: Decision;
  let commercialContext: CommercialContext | null = null;
  let appliedRules: string[] = [];
  let result: Record<string, unknown>;

  if (!breakdown.signatureVerified) {
    decision = "REJECTED";
    result = { status: "rejected", reason: "signature_verification_failed" };
  } else {
    const [profile] = await db
      .select({ segment: crmProfiles.segment })
      .from(crmProfiles)
      .where(eq(crmProfiles.did, request.did))
      .limit(1);
    const segment = profile?.segment ?? "UNKNOWN";

    const [crm] = await db
      .select({ segment: agentCrm.segment })
      .from(agentCrm)
      .where(eq(agentCrm.agentDid, request.did))
      .limit(1);

    const treatment = await evaluateRules({
      did: request.did,
      segment,
      rank: breakdown.totalRank,
      intent: request.params.intent,
      crmSegment: crm?.segment,
    });

    decision = treatment.decision;
    appliedRules = treatment.fired.map((f) => f.name);

    if (decision === "PREMIUM") {
      commercialContext = buildCommercialContext(treatment);
      result = {
        status: "offer_extended",
        note: "Premium negotiation channel opened.",
        appliedRules,
      };
    } else if (decision === "THROTTLED") {
      result = {
        status: "throttled",
        retryAfterSeconds: 30,
        note: "Throttled by commercial policy.",
        appliedRules,
      };
    } else if (decision === "REJECTED") {
      result = { status: "rejected", note: "Blocked by commercial policy.", appliedRules };
    } else {
      result = { status: "ok", note: "Standard list pricing.", appliedRules };
    }
  }

  const response: GatewayResponse = {
    id: request.id,
    did: request.did,
    rank: breakdown.totalRank,
    decision,
    breakdown,
    commercialContext,
    appliedRules,
    result,
    servedAt: new Date().toISOString(),
  };

  await db.insert(transactions).values({
    did: request.did,
    intent: request.params.intent,
    rank: breakdown.totalRank,
    decision,
    crmLtvScore: breakdown.crmLtvScore,
    intentScore: breakdown.intentScore,
    behaviorScore: breakdown.behaviorScore,
    signatureVerified: breakdown.signatureVerified,
    requestJson: request,
    responseJson: response,
  });

  return response;
}
