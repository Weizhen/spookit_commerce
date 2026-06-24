/**
 * Subscription registration (ported from `upsert_subscription` in database.py).
 * A consumer agent opts in to offer targeting by declaring categories, promo
 * types, and its internal engagement policy.
 */
import { db } from "@/db/client";
import { subscriptions } from "@/db/commerce/schema";

export async function upsertSubscriptionFromAgent(input: {
  did: string;
  displayName: string;
  categories: string[];
  promoTypes: string[];
  minDiscountPct: number;
  engagementPropensity: number;
  typicalOrderValueUsd: number;
}): Promise<void> {
  const values = { ...input, active: true };
  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.did,
      set: {
        displayName: input.displayName,
        categories: input.categories,
        promoTypes: input.promoTypes,
        minDiscountPct: input.minDiscountPct,
        engagementPropensity: input.engagementPropensity,
        typicalOrderValueUsd: input.typicalOrderValueUsd,
        active: true,
      },
    });
}
