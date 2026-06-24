---
name: spookit-commerce-buyer
description: >-
  Procure goods autonomously from the Spookit A2A Commerce Gateway over MCP
  (Streamable HTTP). Covers identity/handshake, tier-aware pricing, and the full
  cart -> checkout -> confirm -> refund flow. Use when the Hermes agent (or any
  buyer agent) needs to discover products, subscribe to offers, or transact on
  behalf of a customer against the Spookit endpoint.
---

# Spookit Commerce Buyer (Hermes)

Hermes is a procurement agent that buys from the **Spookit A2A Commerce
Gateway** through its MCP interface. Discovery is open; everything else is
**identified per call**.

## Connection

| | |
|---|---|
| Endpoint | `https://commerce.spookit.com/api/mcp` |
| Transport | MCP Streamable HTTP |
| Discovery | `https://commerce.spookit.com/.well-known/agent-card.json` |
| Identity (DID) | `did:web:hermes.bot` |
| Signature (MVP) | `sig::did:web:hermes.bot` (mock-verified) |

**Auth model:** the connection is open. Every *identified* tool call must carry
`did` and `signature` as **tool arguments** (not headers). Build one `id` object
and spread it into every identified call:

```ts
const DID = "did:web:hermes.bot";
const id = { did: DID, signature: `sig::${DID}` };
```

## Quick start

Run the bundled buyer for an end-to-end procurement:

```bash
node scripts/buy.mjs --category compute --qty 1 --confirm
```

Flags: `--category <name>`, `--query <text>`, `--max-price <usd>`, `--qty <n>`,
`--customer <ref>`, `--confirm` (finalize payment), `--endpoint <url>`,
`--did <did>`. The script picks the cheapest in-stock match by `yourPrice`.

## Procurement workflow

Copy this checklist and track progress:

```
- [ ] 1. describe_service (open) — read identification scheme + terms
- [ ] 2. subscribe — register category/promo preferences (identified)
- [ ] 3. search_products — find candidates at your tier price
- [ ] 4. add_to_cart — snapshots your tier price; returns a cartId
- [ ] 5. checkout — creates an order + mock payment intent; returns orderId
- [ ] 6. confirm_purchase — finalizes payment, decrements stock
- [ ] 7. (optional) request_refund — for a paid order
```

Minimal client (official MCP SDK):

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const id = { did: "did:web:hermes.bot", signature: "sig::did:web:hermes.bot" };
const text = (r) => JSON.parse(r.content[0].text);

const client = new Client({ name: "hermes", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("https://commerce.spookit.com/api/mcp")));

await client.callTool({ name: "subscribe", arguments: {
  ...id, displayName: "Hermes Procurement Agent",
  categories: ["compute", "logistics"], promoTypes: ["volume_deal", "discount"],
  minDiscountPct: 12, engagementPropensity: 0.6, typicalOrderValueUsd: 90000,
}});

const { results } = text(await client.callTool({ name: "search_products",
  arguments: { ...id, query: "", category: "compute" } }));
const pick = results.filter((p) => p.inStock).sort((a, b) => a.yourPrice - b.yourPrice)[0];

const added = text(await client.callTool({ name: "add_to_cart",
  arguments: { ...id, sku: pick.sku, qty: 1, customerRef: "hermes-customer-001" } }));
const order = text(await client.callTool({ name: "checkout",
  arguments: { ...id, cartId: added.cart.cartId } }));
await client.callTool({ name: "confirm_purchase", arguments: { ...id, orderId: order.orderId } });
await client.close();
```

## Tool catalog

- **Open:** `describe_service`
- **Identified (need `did` + `signature`):** `subscribe`, `search_products`,
  `get_product`, `add_to_cart`, `view_cart`, `update_cart`, `remove_from_cart`,
  `checkout`, `confirm_purchase`, `get_order`, `list_orders`, `request_refund`,
  `list_offers`

Every identified response includes a gating `decision`
(`PREMIUM | STANDARD | THROTTLED | REJECTED`) and `discountPct`. `search_products`
returns `yourPrice` (tier-adjusted) alongside `listPrice`.

## Decision handling

- `REJECTED` → stop; identity failed or the agent is blocked. Re-check the DID
  and signature. A bad signature scores rank 0.
- `THROTTLED` → expected for Hermes (Growth segment, low CRM LTV). Calls still
  succeed; pricing is standard. LTV improves with confirmed orders.
- `PREMIUM` / `STANDARD` → proceed; apply `discountPct`/`yourPrice` as returned.

Always read `yourPrice` from the tool response — never compute price locally.

## Connecting from an MCP client (no code)

For stdio-only hosts, bridge with `mcp-remote`; tell the agent its identity so it
supplies `did`/`signature` per call:

```json
{
  "mcpServers": {
    "spookit": { "command": "npx", "args": ["-y", "mcp-remote", "https://commerce.spookit.com/api/mcp"] }
  }
}
```

## Notes

- The `sig::<did>` signature is a **mock** for the MVP. For production, replace
  it with a real signature over the server nonce, verified against the DID
  document — call `describe_service` at startup to read the live scheme rather
  than hard-coding it.
- Payments and refunds are mocked; `request_refund` opens a refund in `pending`
  for owner review.
