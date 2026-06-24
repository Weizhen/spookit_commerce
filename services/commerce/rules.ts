/**
 * Commercial rules engine — TypeScript port of `rules_engine.py`, extended to be
 * CRM-aware.
 *
 * Two layers, evaluated in order:
 *   1. BASE     — standing day-to-day commercial policy (the foundation).
 *   2. CAMPAIGN — promotional overrides that sit ON TOP of the base.
 *
 * Ordering (every firing rule is recorded for full transparency):
 *   - BASE rules apply first, then CAMPAIGN rules layer over them.
 *   - Within a layer, a LOWER `priority` number wins (it is applied last).
 *   - NEW tiebreaker: among equal priority, the more *specific* rule is applied
 *     last so it wins — specificity = agent_did (2) > segment/crm_segment (1) >
 *     global (0). This keeps the demo's behavior identical when specificity is
 *     equal, while letting a per-agent or per-segment CRM rule override a
 *     broad rule at the same priority.
 *
 * Conditions (a rule matches only if ALL of these hold):
 *   - segment      : "ANY" or the agent's reputation segment (legacy demo field)
 *   - intent       : "ANY" or the declared intent
 *   - rank         : min_rank <= rank <= max_rank
 *   - agent_did     : "ANY" or this specific agent's DID            (CRM-aware)
 *   - crm_segment   : "ANY" or the agent's curated CRM segment      (CRM-aware)
 */
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { commercialRules } from "@/db/commerce/schema";
import type { CommercialRule } from "@/db/commerce/schema";
import type { Decision, FiredRule, RuleTreatment } from "./types";

export const PREMIUM_TIERS = ["GOLD", "PLATINUM"] as const;

// Tier -> how long a premium offer is held open for binding.
export const TIER_BINDING_SECONDS: Record<string, number> = {
  PLATINUM: 120,
  GOLD: 60,
  STANDARD: 0,
};

/** Context an agent presents for rule evaluation. */
export interface EvalContext {
  did: string;
  segment: string; // reputation segment (e.g. VIP / UNKNOWN), legacy demo field
  rank: number;
  intent: string;
  crmSegment?: string; // curated Agent CRM segment (VIP / Growth / Watchlist / ...)
}

function matches(rule: CommercialRule, ctx: EvalContext): boolean {
  if (rule.segment !== "ANY" && rule.segment !== ctx.segment) return false;
  if (rule.intent !== "ANY" && rule.intent !== ctx.intent) return false;
  if (rule.agentDid !== "ANY" && rule.agentDid !== ctx.did) return false;
  if (
    rule.crmSegment !== "ANY" &&
    rule.crmSegment !== (ctx.crmSegment ?? "ANY")
  ) {
    return false;
  }
  return rule.minRank <= ctx.rank && ctx.rank <= rule.maxRank;
}

/** Higher number = more specific (applied later so it wins ties). */
function specificity(rule: CommercialRule): number {
  if (rule.agentDid !== "ANY") return 2;
  if (rule.crmSegment !== "ANY" || rule.segment !== "ANY") return 1;
  return 0;
}

function orderedRules(rules: CommercialRule[]): CommercialRule[] {
  const layerOrder: Record<string, number> = { BASE: 0, CAMPAIGN: 1 };
  return [...rules].sort((a, b) => {
    const la = layerOrder[a.layer] ?? 99;
    const lb = layerOrder[b.layer] ?? 99;
    if (la !== lb) return la - lb;
    // priority 1 applied last => sort by priority DESC.
    if (a.priority !== b.priority) return b.priority - a.priority;
    // more specific applied last => sort by specificity ASC.
    return specificity(a) - specificity(b);
  });
}

function applyRule(rule: CommercialRule, t: RuleTreatment): void {
  const action = rule.action;
  if (action === "BLOCK") {
    t.status = "BLOCK";
  } else if (action === "THROTTLE") {
    t.status = "THROTTLE";
  } else if (action === "ALLOW") {
    t.status = "ALLOW";
    if (rule.tier) {
      t.tier = rule.tier;
      t.discountPct = rule.discountPct;
    }
  } else if (action === "SET_TIER") {
    t.status = "ALLOW";
    t.tier = rule.tier;
    t.discountPct = rule.discountPct;
  } else if (action === "ADD_DISCOUNT") {
    // Stacks an extra discount on top of the current tier (no tier change).
    t.discountPct += rule.discountPct;
  }

  if (rule.message) t.message = rule.message;

  t.fired.push({
    id: rule.id,
    name: rule.name,
    layer: rule.layer,
    priority: rule.priority,
    action,
  } satisfies FiredRule);
}

/** Pure evaluation over a provided rule set. */
export function evaluateTreatment(
  rules: CommercialRule[],
  ctx: EvalContext,
): RuleTreatment {
  const t: RuleTreatment = {
    decision: "STANDARD",
    tier: "STANDARD",
    discountPct: 0,
    status: "ALLOW",
    bindingTimeSeconds: 0,
    message: "",
    fired: [],
  };

  for (const rule of orderedRules(rules)) {
    if (matches(rule, ctx)) applyRule(rule, t);
  }

  let decision: Decision;
  if (t.status === "BLOCK") decision = "REJECTED";
  else if (t.status === "THROTTLE") decision = "THROTTLED";
  else if ((PREMIUM_TIERS as readonly string[]).includes(t.tier))
    decision = "PREMIUM";
  else decision = "STANDARD";

  t.decision = decision;
  t.discountPct = Math.max(0, Math.min(t.discountPct, 100));
  t.bindingTimeSeconds = TIER_BINDING_SECONDS[t.tier] ?? 0;
  return t;
}

/** DB-backed evaluation: loads enabled rules and computes the treatment. */
export async function evaluateRules(ctx: EvalContext): Promise<RuleTreatment> {
  const rules = await db
    .select()
    .from(commercialRules)
    .where(eq(commercialRules.enabled, true));
  return evaluateTreatment(rules, ctx);
}
