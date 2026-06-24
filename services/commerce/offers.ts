/**
 * Offers / campaign engine — TypeScript port of `campaign_engine.py`.
 *
 * The outbound counterpart to the reputation gateway: the business pushes a
 * campaign / tailored offer to its subscriber base, and each recipient agent
 * autonomously decides to ENGAGE or IGNORE based on its declared preferences
 * and internal engagement policy.
 *
 * Targeting (opt-in): a subscriber is targeted only if the campaign's
 * product_category is in its categories AND the promo_type is in its
 * promo_types. Everyone else is NOT_TARGETED.
 *
 * Recipient decision (per targeted agent):
 *   effective = base_propensity + boost (offer beats discount bar)
 *                              - penalty (offer below bar)
 *   engages if a random draw falls under `effective`.
 */
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  campaignDeliveries,
  campaigns,
  subscriptions,
} from "@/db/commerce/schema";
import type {
  CampaignRequest,
  CampaignResult,
  DeliveryRecord,
} from "./types";

// Ready-made campaign templates (quick-launch presets + auto-dispatch).
export const CAMPAIGN_TEMPLATES: CampaignRequest[] = [
  {
    name: "Q3 Compute Credits Flash",
    productCategory: "compute",
    promoType: "discount",
    offerDiscountPct: 18,
    headline: "18% off reserved compute — 72h flash window.",
    basePriceUsd: 120000,
  },
  {
    name: "Premium Data Feeds Early Access",
    productCategory: "data_feeds",
    promoType: "early_access",
    offerDiscountPct: 10,
    headline: "Early access to real-time data feeds + 10% launch pricing.",
    basePriceUsd: 60000,
  },
  {
    name: "Logistics Volume Bundle",
    productCategory: "logistics",
    promoType: "volume_deal",
    offerDiscountPct: 22,
    headline: "Tiered volume pricing — up to 22% on freight lanes.",
    basePriceUsd: 90000,
  },
  {
    name: "Energy Spot Bundle",
    productCategory: "energy",
    promoType: "bundle",
    offerDiscountPct: 14,
    headline: "Bundle spot + hedged energy capacity, 14% blended discount.",
    basePriceUsd: 300000,
  },
  {
    name: "Security Suite Renewal",
    productCategory: "security",
    promoType: "discount",
    offerDiscountPct: 12,
    headline: "Renew the security suite early and lock 12% off.",
    basePriceUsd: 75000,
  },
];

interface Subscriber {
  did: string;
  displayName: string;
  categories: string[];
  promoTypes: string[];
  minDiscountPct: number;
  engagementPropensity: number;
  typicalOrderValueUsd: number;
}

/** Run a single subscriber agent's internal engage/ignore policy. */
function decide(
  sub: Subscriber,
  campaign: CampaignRequest,
  rng: () => number,
): DeliveryRecord {
  const matched =
    sub.categories.includes(campaign.productCategory) &&
    sub.promoTypes.includes(campaign.promoType);

  if (!matched) {
    return {
      did: sub.did,
      displayName: sub.displayName,
      matched: false,
      outcome: "NOT_TARGETED",
      reason: "Offer outside subscribed category/promo preferences.",
      projectedValue: 0,
    };
  }

  const base = sub.engagementPropensity;
  const minDisc = sub.minDiscountPct;
  const gap = campaign.offerDiscountPct - minDisc;

  let effective: number;
  let barNote: string;
  if (gap >= 0) {
    const boost = Math.min(gap / 20.0, 1.0) * 0.35;
    effective = Math.min(base + boost, 0.97);
    barNote = `offer ${campaign.offerDiscountPct.toFixed(0)}% >= bar ${minDisc.toFixed(0)}%`;
  } else {
    effective = base * 0.15;
    barNote = `offer ${campaign.offerDiscountPct.toFixed(0)}% < bar ${minDisc.toFixed(0)}%`;
  }

  const draw = rng();
  const engaged = draw < effective;

  if (engaged) {
    const projected =
      sub.typicalOrderValueUsd * (1.0 - campaign.offerDiscountPct / 100.0);
    return {
      did: sub.did,
      displayName: sub.displayName,
      matched: true,
      outcome: "ENGAGED",
      reason: `Engaged — ${barNote}, propensity ${effective.toFixed(2)}.`,
      projectedValue: Math.round(projected * 100) / 100,
    };
  }

  return {
    did: sub.did,
    displayName: sub.displayName,
    matched: true,
    outcome: "IGNORED",
    reason: `Ignored — ${barNote}, propensity ${effective.toFixed(2)} (draw ${draw.toFixed(2)}).`,
    projectedValue: 0,
  };
}

/** Deterministic PRNG (mulberry32) so dispatches can be reproduced with a seed. */
function makeRng(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Broadcast a campaign to the active subscriber base, persist the rollup +
 * per-recipient deliveries, and return the summary.
 */
export async function dispatchCampaign(
  campaign: CampaignRequest,
  opts: { seed?: number } = {},
): Promise<CampaignResult> {
  const rng = makeRng(opts.seed);

  const subs = (await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.active, true))) as unknown as Subscriber[];

  const deliveries = subs.map((s) => decide(s, campaign, rng));

  const targeted = deliveries.filter((d) => d.matched);
  const engaged = targeted.filter((d) => d.outcome === "ENGAGED");
  const ignored = targeted.filter((d) => d.outcome === "IGNORED");
  const projectedRevenue =
    Math.round(engaged.reduce((sum, d) => sum + d.projectedValue, 0) * 100) /
    100;
  const engagementRate =
    targeted.length > 0
      ? Math.round((engaged.length / targeted.length) * 1000) / 10
      : 0;

  const [row] = await db
    .insert(campaigns)
    .values({
      name: campaign.name,
      productCategory: campaign.productCategory,
      promoType: campaign.promoType,
      offerDiscountPct: campaign.offerDiscountPct,
      headline: campaign.headline,
      basePriceUsd: campaign.basePriceUsd,
      subscribers: subs.length,
      targeted: targeted.length,
      engaged: engaged.length,
      ignored: ignored.length,
      projectedRevenue,
    })
    .returning({ id: campaigns.id });

  const campaignId = row.id;

  if (deliveries.length > 0) {
    await db.insert(campaignDeliveries).values(
      deliveries.map((d) => ({
        campaignId,
        did: d.did,
        displayName: d.displayName,
        matched: d.matched,
        outcome: d.outcome,
        reason: d.reason,
        projectedValue: d.projectedValue,
      })),
    );
  }

  return {
    campaignId,
    name: campaign.name,
    productCategory: campaign.productCategory,
    promoType: campaign.promoType,
    offerDiscountPct: campaign.offerDiscountPct,
    subscribers: subs.length,
    targeted: targeted.length,
    engaged: engaged.length,
    ignored: ignored.length,
    engagementRate,
    projectedRevenue,
    deliveries,
  };
}

export { decide as _decideForTest };
