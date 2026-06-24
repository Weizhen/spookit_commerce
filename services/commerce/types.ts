/**
 * Shared contracts for the commerce core — the TypeScript/Zod port of the
 * demo's Pydantic models (`schema.py`). These power both internal service calls
 * and the MCP tool input/output schemas.
 */
import { z } from "zod";

// Shared taxonomy (mirrors the demo + catalog schema).
export const PRODUCT_CATEGORIES = [
  "compute",
  "data_feeds",
  "logistics",
  "energy",
  "security",
] as const;

export const PROMO_TYPES = [
  "discount",
  "bundle",
  "early_access",
  "volume_deal",
] as const;

/**
 * Coarse classification of what an agent is trying to do. The reputation engine
 * maps these to an intent score; higher commercial intent scores higher than
 * passive reconnaissance.
 */
export const AgentIntent = z.enum([
  "execute_contract",
  "negotiate_price",
  "place_order",
  "check_inventory",
  "list_prices",
  "scrape_catalog",
  "unknown",
]);
export type AgentIntent = z.infer<typeof AgentIntent>;

/** Behavioral telemetry + declared intent carried inside a request. */
export const AgentParams = z.object({
  intent: AgentIntent.default("unknown"),
  computeUnits: z.number().min(0).default(1),
  executionUnits: z.number().min(0).default(0),
  payload: z.record(z.unknown()).default({}),
});
export type AgentParams = z.infer<typeof AgentParams>;

/** An identified agent request (DID + mock signature). */
export const AgentRequest = z.object({
  id: z.string(),
  method: z.string().default("commerce.invoke"),
  did: z.string(),
  signature: z.string(),
  params: AgentParams.default({}),
});
export type AgentRequest = z.infer<typeof AgentRequest>;

/** Transparent, auditable breakdown of how a rank was computed. */
export interface ScoreBreakdown {
  crmLtvScore: number;
  intentScore: number;
  behaviorScore: number;
  signatureVerified: boolean;
  totalRank: number;
}

export type Decision = "PREMIUM" | "STANDARD" | "THROTTLED" | "REJECTED";

/** The effective commercial treatment after evaluating all rules. */
export interface RuleTreatment {
  decision: Decision;
  tier: string; // STANDARD | GOLD | PLATINUM
  discountPct: number;
  status: "ALLOW" | "THROTTLE" | "BLOCK";
  bindingTimeSeconds: number;
  message: string;
  fired: FiredRule[];
}

export interface FiredRule {
  id: number;
  name: string;
  layer: string;
  priority: number;
  action: string;
}

/** Premium offer block, injected only for high-trust, high-value agents. */
export interface CommercialContext {
  tier: string;
  targetedDiscountPct: number;
  bindingTimeSeconds: number;
  negotiationToken: string;
  message: string;
}

/** Consumer agent's declared interests + internal engagement policy. */
export const SubscriptionPreferences = z.object({
  categories: z.array(z.string()).default([]),
  promoTypes: z.array(z.string()).default([]),
  minDiscountPct: z.number().min(0).max(100).default(10),
  engagementPropensity: z.number().min(0).max(1).default(0.5),
  typicalOrderValueUsd: z.number().min(0).default(25000),
});
export type SubscriptionPreferences = z.infer<typeof SubscriptionPreferences>;

export const SubscriptionRequest = z.object({
  did: z.string(),
  signature: z.string(),
  displayName: z.string().default("Unnamed Agent"),
  preferences: SubscriptionPreferences.default({}),
});
export type SubscriptionRequest = z.infer<typeof SubscriptionRequest>;

/** A business-side campaign / tailored offer to broadcast to subscribers. */
export const CampaignRequest = z.object({
  name: z.string(),
  productCategory: z.string(),
  promoType: z.string(),
  offerDiscountPct: z.number().min(0).max(100),
  headline: z.string().default(""),
  basePriceUsd: z.number().min(0).default(25000),
});
export type CampaignRequest = z.infer<typeof CampaignRequest>;

export interface DeliveryRecord {
  did: string;
  displayName: string;
  matched: boolean;
  outcome: "ENGAGED" | "IGNORED" | "NOT_TARGETED";
  reason: string;
  projectedValue: number;
}

export interface CampaignResult {
  campaignId: number;
  name: string;
  productCategory: string;
  promoType: string;
  offerDiscountPct: number;
  subscribers: number;
  targeted: number;
  engaged: number;
  ignored: number;
  engagementRate: number;
  projectedRevenue: number;
  deliveries: DeliveryRecord[];
}
