#!/usr/bin/env node
/**
 * Spookit A2A Commerce — autonomous buyer (Hermes).
 *
 * End-to-end procurement against the Spookit MCP endpoint:
 *   describe_service -> subscribe -> search_products -> add_to_cart
 *   -> checkout -> (optional) confirm_purchase
 *
 * Requires: @modelcontextprotocol/sdk (npm i @modelcontextprotocol/sdk)
 *
 * Usage:
 *   node scripts/buy.mjs --category compute --qty 1 --confirm
 *   node scripts/buy.mjs --query "gpu" --max-price 150000 --customer cust-42
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function parseArgs(argv) {
  const out = { confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--confirm") out.confirm = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const ENDPOINT = args.endpoint ?? process.env.SPOOKIT_MCP_URL ?? "https://commerce.spookit.com/api/mcp";
const DID = args.did ?? process.env.SPOOKIT_DID ?? "did:web:hermes.bot";
const id = { did: DID, signature: process.env.SPOOKIT_SIGNATURE ?? `sig::${DID}` };

const text = (r) => JSON.parse(r.content[0].text);

async function main() {
  const client = new Client({ name: "hermes-buyer", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(ENDPOINT)));
  console.log(`connected: ${ENDPOINT} as ${DID}`);

  // 1. Discover (open)
  const svc = text(await client.callTool({ name: "describe_service", arguments: {} }));
  console.log(`service: ${svc.name}`);

  // 2. Subscribe
  await client.callTool({
    name: "subscribe",
    arguments: {
      ...id,
      displayName: "Hermes Procurement Agent",
      categories: args.category ? [args.category] : ["compute", "logistics"],
      promoTypes: ["volume_deal", "discount"],
      minDiscountPct: 12,
      engagementPropensity: 0.6,
      typicalOrderValueUsd: 90000,
    },
  });

  // 3. Search
  const search = text(await client.callTool({
    name: "search_products",
    arguments: {
      ...id,
      query: args.query ?? "",
      category: args.category,
      maxPrice: args["max-price"] ? Number(args["max-price"]) : undefined,
    },
  }));
  console.log(`decision: ${search.decision} | discountPct: ${search.discountPct} | matches: ${search.results?.length ?? 0}`);
  if (search.decision === "REJECTED") throw new Error("gateway REJECTED this agent (check DID/signature)");

  const inStock = (search.results ?? []).filter((p) => p.inStock).sort((a, b) => a.yourPrice - b.yourPrice);
  if (inStock.length === 0) throw new Error("no in-stock products matched the query");
  const pick = inStock[0];
  console.log(`picked: ${pick.sku} (${pick.name}) @ ${pick.yourPrice} ${pick.currency} [list ${pick.listPrice}]`);

  // 4. Add to cart
  const qty = args.qty ? Number(args.qty) : 1;
  const added = text(await client.callTool({
    name: "add_to_cart",
    arguments: { ...id, sku: pick.sku, qty, customerRef: args.customer },
  }));
  const cartId = added.cart.cartId;
  console.log(`cart: ${cartId} | total: ${added.cart.total}`);

  // 5. Checkout
  const order = text(await client.callTool({
    name: "checkout",
    arguments: { ...id, cartId, customerRef: args.customer },
  }));
  if (order.status === "error") throw new Error(`checkout failed: ${order.reason}`);
  console.log(`order: ${order.orderId} | total: ${order.total} | paymentStatus: ${order.paymentStatus}`);

  // 6. Confirm (optional)
  if (args.confirm) {
    const confirmed = text(await client.callTool({
      name: "confirm_purchase",
      arguments: { ...id, orderId: order.orderId },
    }));
    console.log(`confirmed: ${confirmed.orderId} -> ${confirmed.status}`);
  } else {
    console.log("skipped confirm_purchase (pass --confirm to finalize payment)");
  }

  await client.close();
}

main().catch((e) => {
  console.error("ERROR:", e?.message ?? e);
  process.exit(1);
});
