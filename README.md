# Spookit Commerce — Autonomous A2A Commerce Gateway

> **The reputation-aware storefront that sells to machines.**

A cloud-hosted commerce gateway for autonomous agents (A2A). A business owner
stocks the store through a merchandising portal; those products are exposed over
an **MCP (Streamable HTTP)** interface so private buyer agents (e.g. OpenClaw,
Hermes) can discover, subscribe, and transact on behalf of their customers. Every
agent action is scored for reputation and governed by layered, CRM-aware
commercial policy in real time, and overseen through a public industrial control
console.

This is the TypeScript/Next.js MVP that ports the commercial brain from the
[reference demo](https://github.com/Weizhen/spookit_a2a_engine) (Python) and
extends it with a catalog/merchandising service, an A2A commerce surface (cart →
order → refund), and an Agent CRM.

---

## Architecture

A single Next.js app on Vercel hosts everything (one deploy, no CORS):

- **A2A MCP endpoint** — `app/api/mcp/route.ts` (discovery open; subscribe +
  commerce identified).
- **Discovery** — `GET /.well-known/agent-card.json` advertises the endpoint,
  capabilities, and the identification scheme.
- **Dashboard** (public, no auth) — Operations, Campaigns & Offers, Catalog &
  Orders, Agent CRM, Governance, and the A2A spec page.
- **Service modules** (framework-agnostic TypeScript):
  - `services/commerce` — reputation, CRM-aware rules, offers, orders, gateway
    orchestration, analytics (ported from the demo).
  - `services/catalog` — products / merchandising, live source for the A2A tools.
  - `services/crm` — agent CRM (segments, LTV, scoped rules).
  - `services/a2a` — identification scheme + per-action gate.
- **Database** — one Neon Postgres project, two schemas (`commerce` + `catalog`)
  via Drizzle ORM.

```
/app                      Next.js routes (dashboard + /api/mcp + discovery)
/components               Themed console UI primitives
/services/commerce        reputation · rules · offers · orders · gateway · analytics
/services/catalog         merchandising service
/services/crm             agent CRM service
/services/a2a             identification + gating
/db/commerce              Drizzle schema (commerce)
/db/catalog               Drizzle schema (catalog)
/db/seed.ts               demo seed (CRM, rules, products, agents)
```

## The commercial brain (ported from the demo)

- **Reputation** — `rank = 0.45·crmLtv + 0.35·intent + 0.20·behavior` (0–100).
  A failed (mock) signature forces rank 0 → `REJECTED`.
- **Rules engine** — layered BASE → CAMPAIGN policy; within a layer the lowest
  priority number wins. **Extended to be CRM-aware:** rules can target a specific
  `agent_did` or `crm_segment`; among equal priority, the more specific rule wins.
  Actions: `SET_TIER`, `ADD_DISCOUNT`, `ALLOW`, `THROTTLE`, `BLOCK`. Decisions:
  `PREMIUM | STANDARD | THROTTLED | REJECTED`.
- **Offers** — opt-in campaign targeting + each agent's autonomous engage/ignore
  decision (deterministic with a seed).

## Identification (A2A handshake)

Decision per the project plan: **DID + signed nonce, mock-verified for the MVP.**
To keep MCP **stateless** (no session/nonce store), identity is verified
**per-request**: identified tools carry `did` + `signature`, verified as
`sig::<did>` for the MVP (interface ready for a real DID-document verifier).
Agent rows are created on first successful handshake (self-identification).

## Getting started

### 1. Install

```bash
npm install
```

### 2. Provision Neon + configure env

Add Neon via the Vercel Marketplace (or create a Neon project), then:

```bash
cp .env.example .env
# set DATABASE_URL (pooled) and DIRECT_URL (direct, for migrations)
```

### 3. Create schemas + seed

```bash
npm run db:push     # create commerce + catalog schemas
npm run db:seed     # load demo CRM profiles, rules, products, agents
```

### 4. Run

```bash
npm run dev
# Dashboard:   http://localhost:3000
# Agent card:  http://localhost:3000/.well-known/agent-card.json
# MCP:         http://localhost:3000/api/mcp
```

## Trying the A2A surface

Point an MCP client at `/api/mcp`. Discovery is open; commerce requires identity.
For the MVP, sign as `sig::<did>`. Example flow:

1. `describe_service` (open) — read the identification scheme + terms.
2. `subscribe` with `did: "did:web:openclaw.ai"`, `signature: "sig::did:web:openclaw.ai"`.
3. `search_products` → tier-aware pricing.
4. `add_to_cart` → `checkout` → `confirm_purchase`.
5. `request_refund` for a paid order.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next config) |
| `npm run db:push` | Push Drizzle schema to Neon |
| `npm run db:generate` / `db:migrate` | Generate + run SQL migrations |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Drizzle Studio |

## Status (delivery phases)

Implemented: Phase 0 (foundation), Phase 1 (commerce core + analytics), Phase 2
(catalog service + read-only portal view), Phase 3 (discovery + handshake +
subscribe), Phase 4 (transactional commerce tools). In progress: Phase 5 (admin
write APIs + CRM/rule/campaign management UI), Phase 6 (rate limiting,
observability, demo polish).

## Notes & deferred decisions

- **Dashboard auth:** intentionally none (public demo). Gate with Clerk/credential
  before any commercial use.
- **Payments:** mock payment intent; design targets Stripe later.
- **DID verification:** mock `sig::<did>`; swap in a real verifier post-MVP.
- **Refund policy:** refunds open in `pending` for owner review; window/partial
  rules to be finalized.
