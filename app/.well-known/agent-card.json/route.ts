import { NextResponse } from "next/server";

import { IDENTIFICATION_SCHEME } from "@/services/a2a/identity";

export const dynamic = "force-dynamic";

/**
 * Published, machine-readable service spec / agent card. Discovery is public;
 * it advertises the MCP endpoint, capabilities, commercial terms, and — most
 * importantly — the identification scheme an agent must satisfy before any
 * subscription or commerce call.
 */
export function GET() {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  return NextResponse.json({
    name: "Spookit Autonomous A2A Commerce Gateway",
    description:
      "The reputation-aware storefront that sells to machines. Discover products, " +
      "subscribe for tailored offers, and transact on behalf of a customer.",
    version: "0.1.0",
    protocol: "mcp",
    transport: "streamable-http",
    endpoints: {
      mcp: `${baseUrl}/api/mcp`,
      docs: `${baseUrl}/a2a`,
    },
    identification: IDENTIFICATION_SCHEME,
    capabilities: {
      open: ["describe_service"],
      identified: [
        "subscribe",
        "search_products",
        "get_product",
        "add_to_cart",
        "view_cart",
        "checkout",
        "confirm_purchase",
        "get_order",
        "list_orders",
        "request_refund",
        "list_offers",
      ],
    },
    commercialTerms: {
      pricing:
        "Tier-aware. Verified agents are scored (0-100) on CRM LTV, declared " +
        "intent, and execution behavior; commercial rules grant PREMIUM / " +
        "STANDARD / THROTTLED / REJECTED treatment with tiered discounts.",
      payments: "Mock payment intent for the MVP (no real payment rail).",
      refunds: "Refunds are subject to policy review.",
    },
  });
}
