import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { desc } from "drizzle-orm";

import { db } from "@/db/client";
import { campaigns } from "@/db/commerce/schema";
import { IDENTIFICATION_SCHEME } from "@/services/a2a/identity";
import { gateAction } from "@/services/a2a/gate";
import {
  applyAgentPricing,
  getProduct,
  searchProducts,
} from "@/services/catalog";
import {
  addToCart,
  checkout,
  confirmPurchase,
  getOrCreateCart,
  getOrder,
  listOrders,
  removeFromCart,
  requestRefund,
  updateCartItem,
  viewCart,
} from "@/services/commerce/orders";
import { upsertSubscriptionFromAgent } from "@/services/commerce/subscriptions";

type ToolText = { content: { type: "text"; text: string }[] };

const json = (data: unknown): ToolText => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

// Credential fields every identified tool carries (stateless per-request auth).
const creds = {
  did: z.string().describe("Your DID (did:key or did:web)."),
  signature: z
    .string()
    .describe("Signature over the request. Mock: `sig::<did>` for the MVP."),
  pubkey: z
    .string()
    .optional()
    .describe(
      "Your public key (multibase). Required on first handshake for did:web; " +
        "for did:key it is derived from the DID and this field is optional.",
    ),
};

const handler = createMcpHandler(
  (server) => {
    // ---- describe_service (OPEN, no identity required) --------------------
    server.tool(
      "describe_service",
      "Returns service capabilities, commercial terms, and the identification scheme an agent must satisfy before subscribing or transacting.",
      {},
      async () =>
        json({
          name: "Spookit Autonomous A2A Commerce Gateway",
          identification: IDENTIFICATION_SCHEME,
          commercialTerms: {
            pricing:
              "Tier-aware. Verified agents are scored 0-100 (CRM LTV + intent + behavior). Rules grant PREMIUM/STANDARD/THROTTLED/REJECTED with tiered discounts.",
            payments: "Mock payment intent (no real rail) for the MVP.",
          },
          categories: ["compute", "data_feeds", "logistics", "energy", "security"],
        }),
    );

    // ---- subscribe (IDENTIFIED) ------------------------------------------
    server.tool(
      "subscribe",
      "Register/update your offer subscription (categories, promo types, discount bar). Requires identity.",
      {
        ...creds,
        displayName: z.string().optional(),
        categories: z.array(z.string()).default([]),
        promoTypes: z.array(z.string()).default([]),
        minDiscountPct: z.number().min(0).max(100).default(10),
        engagementPropensity: z.number().min(0).max(1).default(0.5),
        typicalOrderValueUsd: z.number().min(0).default(25000),
      },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "negotiate_price",
          displayName: args.displayName,
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });

        await upsertSubscriptionFromAgent({
          did: gate.did,
          displayName: args.displayName ?? "Unnamed Agent",
          categories: args.categories,
          promoTypes: args.promoTypes,
          minDiscountPct: args.minDiscountPct,
          engagementPropensity: args.engagementPropensity,
          typicalOrderValueUsd: args.typicalOrderValueUsd,
        });
        return json({
          status: "subscribed",
          did: gate.did,
          categories: args.categories,
          promoTypes: args.promoTypes,
        });
      },
    );

    // ---- search_products (IDENTIFIED, tier-aware pricing) ----------------
    server.tool(
      "search_products",
      "Search the live catalog. Pricing reflects your agent tier. Requires identity.",
      {
        ...creds,
        query: z.string().default(""),
        category: z.string().optional(),
        maxPrice: z.number().optional(),
      },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "check_inventory",
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });

        const results = await searchProducts(args.query, {
          category: args.category,
          maxPrice: args.maxPrice,
        });
        return json({
          decision: gate.decision,
          discountPct: gate.discountPct,
          throttled: gate.throttled,
          results: results.map((p) => ({
            sku: p.sku,
            name: p.name,
            category: p.category,
            listPrice: Number(p.price),
            yourPrice: applyAgentPricing(Number(p.price), gate.discountPct),
            currency: p.currency,
            inStock: p.stock > 0,
          })),
        });
      },
    );

    // ---- get_product (IDENTIFIED) ----------------------------------------
    server.tool(
      "get_product",
      "Get product detail with your agent-specific price/offer. Requires identity.",
      { ...creds, sku: z.string() },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "check_inventory",
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });

        const p = await getProduct(args.sku);
        if (!p) return json({ status: "not_found", sku: args.sku });
        return json({
          decision: gate.decision,
          discountPct: gate.discountPct,
          product: {
            sku: p.sku,
            name: p.name,
            category: p.category,
            description: p.description,
            listPrice: Number(p.price),
            yourPrice: applyAgentPricing(Number(p.price), gate.discountPct),
            currency: p.currency,
            stock: p.stock,
          },
        });
      },
    );

    // ---- add_to_cart (IDENTIFIED) ----------------------------------------
    server.tool(
      "add_to_cart",
      "Add a product to a cart (creates one if cartId omitted). Snapshots your tier price. Requires identity.",
      {
        ...creds,
        sku: z.string(),
        qty: z.number().int().min(1).default(1),
        cartId: z.string().optional(),
        customerRef: z.string().optional(),
      },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "place_order",
          executionUnits: 1,
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });

        const product = await getProduct(args.sku);
        if (!product) return json({ status: "not_found", sku: args.sku });

        const cartId = await getOrCreateCart(
          gate.did,
          args.customerRef,
          args.cartId,
        );
        const unitPrice = applyAgentPricing(
          Number(product.price),
          gate.discountPct,
        );
        await addToCart(cartId, args.sku, args.qty, unitPrice);
        return json({ status: "added", cart: await viewCart(cartId) });
      },
    );

    // ---- view_cart / update_cart / remove_from_cart ----------------------
    server.tool(
      "view_cart",
      "View a cart's items and total. Requires identity.",
      { ...creds, cartId: z.string() },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "check_inventory",
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });
        return json(await viewCart(args.cartId));
      },
    );

    server.tool(
      "update_cart",
      "Set the quantity of a SKU in a cart (0 removes it). Requires identity.",
      { ...creds, cartId: z.string(), sku: z.string(), qty: z.number().int() },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "place_order",
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });
        await updateCartItem(args.cartId, args.sku, args.qty);
        return json({ status: "updated", cart: await viewCart(args.cartId) });
      },
    );

    server.tool(
      "remove_from_cart",
      "Remove a SKU from a cart. Requires identity.",
      { ...creds, cartId: z.string(), sku: z.string() },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "place_order",
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });
        await removeFromCart(args.cartId, args.sku);
        return json({ status: "removed", cart: await viewCart(args.cartId) });
      },
    );

    // ---- checkout / confirm_purchase -------------------------------------
    server.tool(
      "checkout",
      "Create an order + mock payment intent from a cart. Requires identity.",
      { ...creds, cartId: z.string(), customerRef: z.string().optional() },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "execute_contract",
          executionUnits: 1,
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });
        try {
          const result = await checkout(
            args.cartId,
            gate.did,
            args.customerRef,
            gate.appliedRules,
          );
          const { status: paymentStatus, ...rest } = result;
          return json({ status: "checkout_created", paymentStatus, ...rest });
        } catch (e) {
          return json({
            status: "error",
            reason: e instanceof Error ? e.message : String(e),
          });
        }
      },
    );

    server.tool(
      "confirm_purchase",
      "Finalize the mock payment for an order (decrements stock). Requires identity.",
      { ...creds, orderId: z.string() },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "execute_contract",
          executionUnits: 1,
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });
        try {
          return json(await confirmPurchase(args.orderId, gate.did));
        } catch (e) {
          return json({
            status: "error",
            reason: e instanceof Error ? e.message : String(e),
          });
        }
      },
    );

    // ---- get_order / list_orders -----------------------------------------
    server.tool(
      "get_order",
      "Get an order's status and items. Requires identity.",
      { ...creds, orderId: z.string() },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "check_inventory",
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });
        const order = await getOrder(args.orderId, gate.did);
        return json(order ?? { status: "not_found", orderId: args.orderId });
      },
    );

    server.tool(
      "list_orders",
      "List your orders. Requires identity.",
      { ...creds },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "check_inventory",
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });
        return json({ orders: await listOrders(gate.did) });
      },
    );

    // ---- request_refund ---------------------------------------------------
    server.tool(
      "request_refund",
      "Request a refund for a paid order (subject to policy review). Requires identity.",
      { ...creds, orderId: z.string(), reason: z.string().default("") },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "negotiate_price",
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });
        try {
          return json(await requestRefund(args.orderId, gate.did, args.reason));
        } catch (e) {
          return json({
            status: "error",
            reason: e instanceof Error ? e.message : String(e),
          });
        }
      },
    );

    // ---- list_offers ------------------------------------------------------
    server.tool(
      "list_offers",
      "List active targeted campaign offers relevant to your subscription. Requires identity.",
      { ...creds },
      async (args) => {
        const gate = await gateAction({
          did: args.did,
          signature: args.signature,
          pubkey: args.pubkey,
          intent: "list_prices",
        });
        if (!gate.ok) return json({ status: "denied", reason: gate.reason });
        // Offers are surfaced from recently dispatched campaigns. Full
        // per-agent targeting lives in the offers engine (campaign dispatch).
        const recent = await db
          .select()
          .from(campaigns)
          .orderBy(desc(campaigns.id))
          .limit(10);
        return json({ offers: recent });
      },
    );
  },
  {},
  { basePath: "/api", maxDuration: 60 },
);

export { handler as GET, handler as POST, handler as DELETE };
