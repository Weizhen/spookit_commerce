/**
 * Reputation engine — TypeScript port of `reputation_engine.py`.
 *
 * Turns an incoming agent request + CRM lookup into a Trust & Value Rank (0-100):
 *
 *   rank = 0.45 * crmLtvScore + 0.35 * intentScore + 0.20 * behaviorScore
 *
 * A failed (mock) signature verification zeroes the rank outright — an
 * unverifiable agent can never be trusted regardless of its CRM standing.
 */
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { crmProfiles } from "@/db/commerce/schema";
import type { AgentParams, AgentRequest, Decision, ScoreBreakdown } from "./types";

// Weights sum to 1.0 so the weighted sum stays in the 0-100 band.
export const W_CRM = 0.45;
export const W_INTENT = 0.35;
export const W_BEHAVIOR = 0.2;

export const PREMIUM_THRESHOLD = 70.0; // rank strictly above => premium routing
export const STANDARD_THRESHOLD = 40.0; // between standard and premium => standard

// Keyword -> intent points (0-100). Transactional intents score highest;
// passive reconnaissance scores lowest.
export const INTENT_KEYWORD_SCORES: Record<string, number> = {
  execute_contract: 100.0,
  place_order: 90.0,
  negotiate_price: 80.0,
  check_inventory: 50.0,
  list_prices: 25.0,
  scrape_catalog: 5.0,
  unknown: 15.0,
};

/**
 * Mock cryptographic DID signature verification. For the MVP this is a
 * deterministic string-match; the interface is identical to what a real
 * elliptic-curve verifier would need so it can be swapped in later.
 *
 * Valid mock signatures take the form `sig::<did>`.
 */
export function verifySignature(did: string, signature: string): boolean {
  return signature === `sig::${did}`;
}

function intentScore(intent: string): number {
  return INTENT_KEYWORD_SCORES[intent] ?? INTENT_KEYWORD_SCORES.unknown;
}

/**
 * Execution-to-compute ratio mapped to 0-100. A pure consumer of read APIs
 * (lots of compute, zero execution) trends to 0; an agent that actually
 * executes relative to compute trends to 100. Ratio capped at 1.0.
 */
function behaviorScore(computeUnits: number, executionUnits: number): number {
  let ratio: number;
  if (computeUnits <= 0) {
    ratio = executionUnits > 0 ? 1.0 : 0.0;
  } else {
    ratio = executionUnits / computeUnits;
  }
  ratio = Math.max(0.0, Math.min(ratio, 1.0));
  return Math.round(ratio * 100.0 * 100) / 100;
}

/**
 * Pure scoring: given the agent's CRM LTV score (0-100) and request params,
 * compute the breakdown + provisional reputation-only decision. The final
 * *commercial* decision is governed by the rules engine, not this threshold.
 */
export function computeScore(
  crmLtvScore: number,
  params: AgentParams,
  signatureOk: boolean,
): { breakdown: ScoreBreakdown; decision: Decision } {
  const intentPts = intentScore(params.intent);
  const behaviorPts = behaviorScore(params.computeUnits, params.executionUnits);

  if (!signatureOk) {
    return {
      breakdown: {
        crmLtvScore,
        intentScore: intentPts,
        behaviorScore: behaviorPts,
        signatureVerified: false,
        totalRank: 0.0,
      },
      decision: "REJECTED",
    };
  }

  let total =
    W_CRM * crmLtvScore + W_INTENT * intentPts + W_BEHAVIOR * behaviorPts;
  total = Math.round(Math.max(0.0, Math.min(total, 100.0)) * 100) / 100;

  let decision: Decision;
  if (total > PREMIUM_THRESHOLD) decision = "PREMIUM";
  else if (total >= STANDARD_THRESHOLD) decision = "STANDARD";
  else decision = "THROTTLED";

  return {
    breakdown: {
      crmLtvScore,
      intentScore: intentPts,
      behaviorScore: behaviorPts,
      signatureVerified: true,
      totalRank: total,
    },
    decision,
  };
}

/**
 * Full scoring against persisted CRM state: verifies the (mock) signature,
 * looks up the CRM LTV score, and returns the breakdown + provisional decision.
 */
export async function scoreRequest(
  request: AgentRequest,
): Promise<{ breakdown: ScoreBreakdown; decision: Decision }> {
  const signatureOk = verifySignature(request.did, request.signature);

  const profile = await db
    .select({ ltvScore: crmProfiles.ltvScore })
    .from(crmProfiles)
    .where(eq(crmProfiles.did, request.did))
    .limit(1);

  const crmLtvScore = profile[0]?.ltvScore ?? 0.0;

  return computeScore(crmLtvScore, request.params, signatureOk);
}
