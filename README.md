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

- **Marketing site** — public landing at `/` (concept, workflow, skill install,
  CTA to the console). Live at [commerce.spookit.com](https://commerce.spookit.com/).
- **A2A MCP endpoint** — `app/api/[transport]/route.ts` (discovery open; subscribe +
  commerce identified).
- **Discovery** — `GET /.well-known/agent-card.json` advertises the endpoint,
  capabilities, and the identification scheme.
- **Dashboard** (public, no auth) — Operations at `/dashboard`, plus Campaigns &
  Offers, Catalog & Orders, Agent CRM, Governance, and the A2A spec page.
- **Service modules** (framework-agnostic TypeScript):
  - `services/commerce` — reputation, CRM-aware rules, offers, orders, gateway
    orchestration, analytics (ported from the demo).
  - `services/catalog` — products / merchandising, live source for the A2A tools.
  - `services/crm` — agent CRM (segments, LTV, scoped rules).
  - `services/a2a` — DID parsing/validation (`did.ts`), identification scheme +
    TOFU key binding (`identity.ts`), per-action gate (`gate.ts`).
- **Database** — one Neon Postgres project, two schemas (`commerce` + `catalog`)
  via Drizzle ORM.

```
/app                      Next.js routes (dashboard + /api/mcp + discovery)
/components               Themed console UI primitives
/services/commerce        reputation · rules · offers · orders · gateway · analytics
/services/catalog         merchandising service
/services/crm             agent CRM service
/services/a2a             DID parsing · identification (TOFU) · gating
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
**per-request**: identified tools carry `did` + `signature` (+ optional `pubkey`),
verified as `sig::<did>` for the MVP. Agent rows are created on first successful
handshake (self-identification).

Around the (unchanged) mock signature, two correctness layers make the design
robust so a real verifier can drop in later without touching callers:

- **Method negotiation** — only accepted DID methods pass: **`did:key`** (unique
  by keypair; the public key is embedded in the DID) and **`did:web`** (unique by
  domain). The DID is parsed, validated, and **normalized** (the `did:<method>:`
  prefix and any `did:web` domain are lowercased). Unsupported/malformed DIDs are
  rejected with precise reasons (`did_method_unsupported` / `did_malformed`).
- **Trust-on-first-use (TOFU) key binding** — a DID is locked to the **first
  public key seen** for it. `did:key` derives that key from the DID itself;
  `did:web` must present `pubkey` on its first handshake. A later call presenting
  the same DID with a **different** key is rejected as `identity_key_mismatch`,
  blocking impersonation. (No DB migration — the `agents.pubkey` column already
  exists.)

Failure reasons surfaced to the agent: `missing_credentials`, `did_malformed`,
`did_method_unsupported`, `signature_verification_failed`,
`pubkey_required_for_method`, `identity_key_mismatch`, `agent_revoked`.

The published agent card and `describe_service` advertise the live scheme
(accepted methods, recommendation, `keyBinding`, and the `pubkey` credential
field), so agents read it at runtime rather than hard-coding it. Implementation:
`services/a2a/did.ts` (pure parsing/validation/key-derivation, the seam for real
`did:key` decode) + `services/a2a/identity.ts` (verification flow). The mock
signature itself stays in `services/commerce/reputation.ts`.

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
# Marketing:  http://localhost:3000
# Dashboard:  http://localhost:3000/dashboard
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

The seeded agents (`did:web:openclaw.ai`, `did:web:hermes.bot`) adopt their key on
first handshake, so they work without sending `pubkey`. A **new** identity should
use a `did:key` (key derived from the DID) — or a `did:web` that presents `pubkey`
on its first call. See [Choosing and generating a DID](#choosing-and-generating-a-did-client-side).

## Buyer agent skill (Hermes)

The [`Skill/`](Skill) folder is a portable **Agent Skill** that teaches a buyer
agent (e.g. Hermes) how to transact against the live gateway. Install and usage
instructions are also on the [marketing site](https://commerce.spookit.com/#test).
The skill contains `SKILL.md` and a runnable end-to-end buyer (`scripts/buy.mjs`).

```
Skill/
├── SKILL.md            # connection, identity, procurement workflow, tool catalog
└── scripts/
    └── buy.mjs         # autonomous buyer: search → cart → checkout → confirm
```

### Install

1. Copy the `Skill/` folder into your agent's skills directory:
   - Cursor / Claude: `~/.cursor/skills/spookit-commerce-buyer/` (personal) or
     `<repo>/.cursor/skills/spookit-commerce-buyer/` (project).
   - Other agents: drop `SKILL.md` wherever your runtime loads skills.
2. Install the one runtime dependency the script needs:

```bash
npm install @modelcontextprotocol/sdk
```

### Use

Run the bundled buyer end-to-end (defaults to the live endpoint and the Hermes
identity):

```bash
node Skill/scripts/buy.mjs --category compute --qty 1 --confirm
```

Flags: `--category <name>`, `--query <text>`, `--max-price <usd>`, `--qty <n>`,
`--customer <ref>`, `--confirm` (finalize payment), `--endpoint <url>`,
`--did <did>`, `--pubkey <multibase>` (only for a new `did:web`). Identity can
also be set via `SPOOKIT_MCP_URL`, `SPOOKIT_DID`, `SPOOKIT_SIGNATURE`, and
`SPOOKIT_PUBKEY` env vars.

Connection details (also in `SKILL.md`):

| | |
|---|---|
| Endpoint | `https://commerce.spookit.com/api/mcp` |
| Identity (DID) | `did:web:hermes.bot` |
| Signature (MVP) | `sig::did:web:hermes.bot` (mock-verified) |

To wire the skill into a stdio-only MCP host instead of running the script,
bridge with `mcp-remote`:

```json
{
  "mcpServers": {
    "spookit": { "command": "npx", "args": ["-y", "mcp-remote", "https://commerce.spookit.com/api/mcp"] }
  }
}
```

### Choosing and generating a DID (client-side)

The gateway is a **pure verifier** — it never mints DIDs. Your agent generates a
DID it controls off-platform and presents it on every call. The server accepts
two methods and binds your DID to the **first public key it sees**
(trust-on-first-use), so uniqueness and anti-impersonation come from key control,
not from randomizing the DID string.

- **`did:key`** — recommended for ephemeral/anonymous buyers. Unique by keypair,
  no infrastructure. The public key is embedded in the DID, so `pubkey` is
  optional.
- **`did:web`** — use if you have a stable domain and want a human-readable
  identity. You **must** present `pubkey` on the first handshake (the server
  resolves the key from your DID document in production).

Generate once, persist the private key, and reuse the DID forever — reputation
accrues to it across sessions. Rotate only on compromise (a new DID = new
reputation). Pseudocode:

```js
import { generateKeyPair } from "@noble/ed25519"; // or any Ed25519 lib

// 1. One-time: create a keypair and derive a did:key. PERSIST the private key.
const { publicKey, privateKey } = await generateKeyPair();
const did = `did:key:${multibaseBase58btc(0xed01, publicKey)}`; // z6Mk...
savePrivateKey(privateKey);

// 2. Per request: sign the challenge. (MVP mock accepts `sig::<did>`.)
const signature = `sig::${did}`; // production: real Ed25519 signature

// 3. Present credentials on every identified tool call.
await callTool("search_products", { did, signature /*, pubkey for did:web */ });
```

The server normalizes your DID (lowercases the `did:<method>:` prefix and the
did:web domain), so sign over the normalized form.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next config) |
| `npm test` | Vitest unit tests (DID parsing + identity) |
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
- **DID verification:** mock `sig::<did>` with method negotiation (did:key /
  did:web) + trust-on-first-use key binding around it; swap in a real signature
  verifier and `did:key` multibase decode (the `deriveKeyFromDid` seam) post-MVP.
- **Refund policy:** refunds open in `pending` for owner review; window/partial
  rules to be finalized.
