/**
 * Commerce core + Agent CRM schema (Postgres schema: `commerce`).
 *
 * Carried over from the demo (Python `database.py`): crm_profiles, transactions,
 * subscriptions, campaigns, campaign_deliveries, commercial_rules.
 *
 * New for the MVP: agents (self-identified on first handshake), agent_crm,
 * agent_tags, carts, cart_items, orders, order_items, refunds. The
 * commercial_rules table is extended with `agent_did` + `crm_segment` so rules
 * can target a specific agent or CRM segment (CRM-aware policy).
 *
 * Cross-schema note: order/cart rows reference `catalog` SKUs as a *soft*
 * reference and snapshot the price at add/checkout time, so commerce data stays
 * correct even if catalog prices change or a product is later removed.
 */
import {
  pgSchema,
  serial,
  text,
  integer,
  boolean,
  real,
  numeric,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const commerce = pgSchema("commerce");

// --- Reputation / CRM (ported) ---------------------------------------------

export const crmProfiles = commerce.table("crm_profiles", {
  did: text("did").primaryKey(),
  displayName: text("display_name").notNull(),
  segment: text("segment").notNull(),
  ltvUsd: real("ltv_usd").notNull().default(0),
  // 0-100 normalized lifetime-value score feeding the reputation rank.
  ltvScore: real("ltv_score").notNull().default(0),
  known: boolean("known").notNull().default(false),
  notes: text("notes"),
});

export const transactions = commerce.table(
  "transactions",
  {
    id: serial("id").primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    did: text("did").notNull(),
    intent: text("intent").notNull(),
    rank: real("rank").notNull(),
    decision: text("decision").notNull(),
    crmLtvScore: real("crm_ltv_score").notNull(),
    intentScore: real("intent_score").notNull(),
    behaviorScore: real("behavior_score").notNull(),
    signatureVerified: boolean("signature_verified").notNull(),
    requestJson: jsonb("request_json").notNull(),
    responseJson: jsonb("response_json").notNull(),
  },
  (t) => [
    index("transactions_did_idx").on(t.did),
    index("transactions_ts_idx").on(t.ts),
  ],
);

// --- Subscriptions / Campaigns (ported) ------------------------------------

export const subscriptions = commerce.table("subscriptions", {
  did: text("did").primaryKey(),
  displayName: text("display_name").notNull(),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  promoTypes: jsonb("promo_types").$type<string[]>().notNull().default([]),
  minDiscountPct: real("min_discount_pct").notNull().default(10),
  engagementPropensity: real("engagement_propensity").notNull().default(0.5),
  typicalOrderValueUsd: real("typical_order_value_usd").notNull().default(25000),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campaigns = commerce.table("campaigns", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  name: text("name").notNull(),
  productCategory: text("product_category").notNull(),
  promoType: text("promo_type").notNull(),
  offerDiscountPct: real("offer_discount_pct").notNull(),
  headline: text("headline").default(""),
  basePriceUsd: real("base_price_usd").notNull().default(25000),
  subscribers: integer("subscribers").notNull().default(0),
  targeted: integer("targeted").notNull().default(0),
  engaged: integer("engaged").notNull().default(0),
  ignored: integer("ignored").notNull().default(0),
  projectedRevenue: real("projected_revenue").notNull().default(0),
});

export const campaignDeliveries = commerce.table(
  "campaign_deliveries",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    did: text("did").notNull(),
    displayName: text("display_name").notNull(),
    matched: boolean("matched").notNull(),
    outcome: text("outcome").notNull(), // ENGAGED | IGNORED | NOT_TARGETED
    reason: text("reason"),
    projectedValue: real("projected_value").notNull().default(0),
  },
  (t) => [index("deliveries_campaign_idx").on(t.campaignId)],
);

// --- Commercial rules (ported + CRM-aware extension) -----------------------

export const commercialRules = commerce.table(
  "commercial_rules",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    layer: text("layer").notNull(), // BASE | CAMPAIGN
    priority: integer("priority").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    // Existing demo conditions.
    segment: text("segment").notNull().default("ANY"),
    intent: text("intent").notNull().default("ANY"),
    minRank: real("min_rank").notNull().default(0),
    maxRank: real("max_rank").notNull().default(100),
    // NEW CRM-aware conditions: target a specific agent or CRM segment.
    // "ANY" means the condition is not used by this rule.
    agentDid: text("agent_did").notNull().default("ANY"),
    crmSegment: text("crm_segment").notNull().default("ANY"),
    action: text("action").notNull(), // SET_TIER | ADD_DISCOUNT | ALLOW | THROTTLE | BLOCK
    tier: text("tier").notNull().default("STANDARD"),
    discountPct: real("discount_pct").notNull().default(0),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("rules_layer_idx").on(t.layer),
    index("rules_agent_idx").on(t.agentDid),
  ],
);

// --- Agents + Agent CRM (new) ----------------------------------------------

export const agents = commerce.table("agents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  did: text("did").notNull().unique(),
  displayName: text("display_name").notNull().default("Unnamed Agent"),
  // Public key used for (mock for MVP) signature verification.
  pubkey: text("pubkey"),
  status: text("status").notNull().default("active"), // active | revoked
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const agentCrm = commerce.table("agent_crm", {
  agentDid: text("agent_did").primaryKey(),
  segment: text("segment").notNull().default("Growth"), // VIP | Growth | Watchlist | Blocked | ...
  ltvUsd: real("ltv_usd").notNull().default(0),
  totalOrders: integer("total_orders").notNull().default(0),
  lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
  notes: text("notes"),
});

export const agentTags = commerce.table(
  "agent_tags",
  {
    id: serial("id").primaryKey(),
    agentDid: text("agent_did").notNull(),
    tag: text("tag").notNull(),
  },
  (t) => [index("agent_tags_did_idx").on(t.agentDid)],
);

// --- Cart / Orders / Refunds (new) -----------------------------------------

export const carts = commerce.table(
  "carts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    agentDid: text("agent_did").notNull(),
    customerRef: text("customer_ref"),
    status: text("status").notNull().default("open"), // open | checked_out | abandoned
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("carts_agent_idx").on(t.agentDid)],
);

export const cartItems = commerce.table(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    cartId: text("cart_id").notNull(),
    sku: text("sku").notNull(), // soft reference into catalog.products
    qty: integer("qty").notNull().default(1),
    // Price snapshot at add time (tier/offer-adjusted), in major units.
    unitPriceSnapshot: numeric("unit_price_snapshot", {
      precision: 12,
      scale: 2,
    }).notNull(),
  },
  (t) => [index("cart_items_cart_idx").on(t.cartId)],
);

export const orders = commerce.table(
  "orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    agentDid: text("agent_did").notNull(),
    customerRef: text("customer_ref"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("pending"), // pending | paid | refunded | cancelled
    // Snapshot of which rules fired + the granted treatment at checkout.
    appliedRules: jsonb("applied_rules").$type<unknown>().default([]),
    paymentIntentId: text("payment_intent_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("orders_agent_idx").on(t.agentDid),
    index("orders_status_idx").on(t.status),
  ],
);

export const orderItems = commerce.table(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id").notNull(),
    sku: text("sku").notNull(),
    qty: integer("qty").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const refunds = commerce.table("refunds", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- Inferred types ---------------------------------------------------------

export type CrmProfile = typeof crmProfiles.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CommercialRule = typeof commercialRules.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type AgentCrm = typeof agentCrm.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
