/**
 * Per-action gate for identified A2A calls.
 *
 * Combines identification (stateless, per-request signature) with the commerce
 * core's reputation scoring + CRM-aware rules engine. Every identified call runs
 * through: identity -> reputation score -> rule evaluation -> decision, and is
 * logged as a transaction for the live dashboard.
 */
import { evaluateAgentRequest } from "@/services/commerce/gateway";
import type { AgentIntent, Decision } from "@/services/commerce/types";
import { verifyIdentity } from "./identity";

export interface GateResult {
  ok: boolean;
  did: string;
  decision: Decision;
  discountPct: number;
  throttled: boolean;
  reason?: string;
  appliedRules: string[];
}

export async function gateAction(opts: {
  did?: string;
  signature?: string;
  intent: AgentIntent;
  displayName?: string;
  computeUnits?: number;
  executionUnits?: number;
}): Promise<GateResult> {
  const identity = await verifyIdentity(opts.did, opts.signature, opts.displayName);
  if (!identity.ok) {
    return {
      ok: false,
      did: identity.did,
      decision: "REJECTED",
      discountPct: 0,
      throttled: false,
      reason: identity.reason,
      appliedRules: [],
    };
  }

  const response = await evaluateAgentRequest({
    id: crypto.randomUUID(),
    method: "commerce.invoke",
    did: identity.did,
    signature: opts.signature!,
    params: {
      intent: opts.intent,
      computeUnits: opts.computeUnits ?? 1,
      executionUnits: opts.executionUnits ?? 0,
      payload: {},
    },
  });

  if (response.decision === "REJECTED") {
    return {
      ok: false,
      did: identity.did,
      decision: "REJECTED",
      discountPct: 0,
      throttled: false,
      reason: "blocked_by_commercial_policy",
      appliedRules: response.appliedRules,
    };
  }

  return {
    ok: true,
    did: identity.did,
    decision: response.decision,
    discountPct: response.commercialContext?.targetedDiscountPct ?? 0,
    throttled: response.decision === "THROTTLED",
    appliedRules: response.appliedRules,
  };
}
