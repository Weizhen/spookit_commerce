/**
 * Catalog / Merchandising service schema (Postgres schema: `catalog`).
 *
 * The business owner stocks sellable products here through the merchandising
 * portal. Active products are the single source of truth for the A2A commerce
 * tools (`search_products` / `get_product`) — anything published here is
 * immediately discoverable and buyable by shopper agents.
 */
import {
  pgSchema,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const catalog = pgSchema("catalog");

// Shared taxonomy mirrors the demo's PRODUCT_CATEGORIES so campaigns,
// subscriptions and products all agree on the same vocabulary.
export const PRODUCT_CATEGORIES = [
  "compute",
  "data_feeds",
  "logistics",
  "energy",
  "security",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const products = catalog.table(
  "products",
  {
    sku: text("sku").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url"),
    // Money as numeric to avoid float drift; render/compute in minor units.
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    stock: integer("stock").notNull().default(0),
    // Whether this product can carry targeted campaign offers.
    offerEligible: boolean("offer_eligible").notNull().default(true),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("products_category_idx").on(t.category),
    index("products_active_idx").on(t.active),
  ],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
