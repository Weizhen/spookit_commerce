/**
 * Catalog / Merchandising service.
 *
 * Owns sellable products. Active products are the source of truth for the A2A
 * commerce tools (`search_products` / `get_product`), so anything the owner
 * publishes in the merchandising portal is immediately buyable by agents.
 * Out-of-stock / inactive products are hidden from agent-facing search.
 */
import { and, eq, gt, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { products } from "@/db/catalog/schema";
import type { NewProduct, Product } from "@/db/catalog/schema";

export interface SearchFilters {
  category?: string;
  maxPrice?: number;
  inStockOnly?: boolean;
}

/** Agent-facing search: only active, in-stock products are returned. */
export async function searchProducts(
  query: string,
  filters: SearchFilters = {},
  limit = 25,
): Promise<Product[]> {
  const conditions = [eq(products.active, true)];

  if (filters.inStockOnly !== false) {
    conditions.push(gt(products.stock, 0));
  }
  if (query?.trim()) {
    const q = `%${query.trim()}%`;
    conditions.push(
      or(ilike(products.name, q), ilike(products.description, q))!,
    );
  }
  if (filters.category) {
    conditions.push(eq(products.category, filters.category));
  }
  if (typeof filters.maxPrice === "number") {
    conditions.push(sql`${products.price} <= ${filters.maxPrice}`);
  }

  return db
    .select()
    .from(products)
    .where(and(...conditions))
    .limit(limit);
}

/** Agent-facing product detail. Returns null if missing or not active. */
export async function getProduct(sku: string): Promise<Product | null> {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.sku, sku), eq(products.active, true)))
    .limit(1);
  return row ?? null;
}

/** Owner-facing: every product regardless of status (for the portal). */
export async function listAllProducts(): Promise<Product[]> {
  return db.select().from(products).orderBy(products.category, products.name);
}

export async function upsertProduct(input: NewProduct): Promise<Product> {
  const [row] = await db
    .insert(products)
    .values({ ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: products.sku,
      set: {
        name: input.name,
        category: input.category,
        description: input.description,
        imageUrl: input.imageUrl,
        price: input.price,
        currency: input.currency,
        stock: input.stock,
        offerEligible: input.offerEligible,
        active: input.active,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function setProductActive(
  sku: string,
  active: boolean,
): Promise<void> {
  await db
    .update(products)
    .set({ active, updatedAt: new Date() })
    .where(eq(products.sku, sku));
}

/**
 * Decrement stock atomically on purchase. Returns true if the decrement
 * succeeded (i.e. enough stock was available), false otherwise.
 */
export async function decrementStock(
  sku: string,
  qty: number,
): Promise<boolean> {
  const res = await db
    .update(products)
    .set({ stock: sql`${products.stock} - ${qty}`, updatedAt: new Date() })
    .where(and(eq(products.sku, sku), sql`${products.stock} >= ${qty}`))
    .returning({ sku: products.sku });
  return res.length > 0;
}

/**
 * Apply tier/offer pricing to a base price. Returns the adjusted unit price
 * (major units, 2dp). The discount comes from the rules-engine treatment.
 */
export function applyAgentPricing(basePrice: number, discountPct: number): number {
  const adj = basePrice * (1 - Math.max(0, Math.min(discountPct, 100)) / 100);
  return Math.round(adj * 100) / 100;
}
