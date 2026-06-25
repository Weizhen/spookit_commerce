# Implementation Blueprint — DID Identity: Method Negotiation + TOFU Key Binding

> **Audience:** coding agent implementing this feature in `spookit_commerce`.
> **Scope:** strengthen agent identification so DID **uniqueness and anti-hijack**
> are enforced correctly, and the handshake **advertises accepted DID methods +
> proof-of-control**. **Do NOT** replace the mock signature crypto (kept per plan
> §15.3) — this work makes the design correct-by-construction so real verification
> can drop in later without touching callers.

---

## 0. Background & guiding principles (read first)

- A DID is **self-sovereign**: the agent generates it off-platform and presents
  it. The server **never mints DIDs**. Do not add any server-side DID generation.
- **Uniqueness comes from the DID method, not from randomization.** Do not add
  "randomize your DID" guidance. `did:key` is unique by keypair; `did:web` by
  domain.
- The real protection against collision/impersonation is **proof of key
  control** + **trust-on-first-use (TOFU) binding** of a DID to its public key.
- Keep the mock signature (`sig::<did>`) intact. Add the *binding* and *method
  validation* layers around it. Mark the exact seam where real verification lands.

---

## 1. Current state (baseline anchors)

- `services/a2a/identity.ts`
  - `IDENTIFICATION_SCHEME` — single `method: "did-signed-nonce"` constant,
    surfaced by both the agent card and `describe_service`.
  - `verifyIdentity(did, signature, displayName)` — checks presence → mock
    signature → revoked → `registerAgent`. **No method validation, no key
    binding.**
- `services/commerce/reputation.ts` → `verifySignature(did, signature)` returns
  `signature === \`sig::${did}\``. **Leave this function's behavior unchanged.**
- `services/crm/index.ts` → `registerAgent({ did, displayName, pubkey? })`. Sets
  `pubkey` on **insert only**; `onConflictDoUpdate` does **not** touch or check
  `pubkey`. The `agents.pubkey` column already exists (`db/commerce/schema.ts`).
- `services/a2a/gate.ts` → `gateAction({ did, signature, ... })` calls
  `verifyIdentity` then `evaluateAgentRequest`. Threads `did` + `signature` only.
- `app/api/mcp/route.ts` → `creds` object defines the `did` + `signature` zod
  fields spread into every identified tool.
- `app/.well-known/agent-card.json/route.ts` → spreads `IDENTIFICATION_SCHEME`
  into the `identification` field.

**No database migration is required** — `agents.pubkey` already exists.

---

## 2. Deliverables (what to build)

### 2.1 New module: `services/a2a/did.ts` (DID parsing/validation/key derivation)

Pure, dependency-light, fully unit-testable. No DB, no network.

```ts
export const ACCEPTED_DID_METHODS = ["key", "web"] as const;
export type DidMethod = (typeof ACCEPTED_DID_METHODS)[number];

export interface ParsedDid {
  did: string;        // normalized full DID
  method: DidMethod;
  methodSpecificId: string;
}

/** Parse + validate a DID string against accepted methods.
 *  - Enforce syntax: /^did:(key|web):[A-Za-z0-9._:%-]+$/
 *  - Normalize: trim; lowercase the `did:<method>:` prefix (NOT the MSI, since
 *    did:key MSIs are case-sensitive multibase). For did:web, lowercase the
 *    domain portion only.
 *  - Reject unknown methods with a clear error string.
 *  Returns ParsedDid on success; throws DidError (typed) on failure. */
export function parseDid(raw: string): ParsedDid;

/** For did:key: derive the expected verification key material from the DID
 *  itself (the multibase MSI). Return a canonical string fingerprint we can
 *  store/compare. For the MVP this MAY be the MSI substring (no decode required)
 *  — but isolate it behind this function so a real multibase/multicodec decode
 *  can replace it. Returns null for methods where the key is not embedded
 *  (e.g. did:web, which requires resolution). */
export function deriveKeyFromDid(parsed: ParsedDid): string | null;
```

- Define and export a typed `DidError` (or a discriminated result) carrying a
  machine-readable `reason` string (e.g. `"did_malformed"`,
  `"did_method_unsupported"`).
- Keep `deriveKeyFromDid` a thin seam; document that real `did:key` decoding
  (multibase base58btc + multicodec `0xed01` for Ed25519) goes here later.

### 2.2 Enrich `IDENTIFICATION_SCHEME` (`services/a2a/identity.ts`)

Replace the constant with a richer, still-`as const` object. Both the agent card
and `describe_service` pick this up automatically (no other edits needed there).

```ts
export const IDENTIFICATION_SCHEME = {
  method: "did-signed-nonce",
  description:
    "Present a DID you control plus a signature over a server-issued nonce. " +
    "The DID must use an accepted method; the server binds your DID to the " +
    "public key it first sees (trust-on-first-use). For the MVP the signature " +
    "is mock-verified as `sig::<did>`; production verifies a real signature " +
    "against the DID document's verification key.",
  acceptedDidMethods: ["did:key", "did:web"],
  recommendation:
    "Use did:key for ephemeral/anonymous buyer agents (unique by keypair, no " +
    "infrastructure). Use did:web if you have a stable domain and want a " +
    "human-readable identity.",
  proofOfControl:
    "Uniqueness and anti-impersonation come from key control, not from DID " +
    "randomization. Do not invent bare random DIDs without a keypair.",
  credentialFields: { did: "did", signature: "signature", pubkey: "pubkey" },
  keyBinding: "trust-on-first-use", // DID locked to first-seen public key
  stateless: true,
  mockForMvp: true,
} as const;
```

### 2.3 Add optional `pubkey` credential to identified tools (`app/api/mcp/route.ts`)

Extend the shared `creds` zod object with an **optional** `pubkey`:

```ts
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
```

Thread `pubkey` through to `gateAction` (see 2.5) in **every** identified tool
handler that already passes `did`/`signature`. (Search the file for
`signature: args.signature` and add `pubkey: args.pubkey` alongside each.)

### 2.4 TOFU binding in `registerAgent` (`services/crm/index.ts`)

Change `registerAgent` to enforce key binding and return a typed outcome instead
of silently upserting.

```ts
export type RegisterResult =
  | { ok: true; agent: Agent; boundKey: string | null }
  | { ok: false; reason: "identity_key_mismatch" };

export async function registerAgent(input: {
  did: string;
  displayName?: string;
  pubkey?: string | null; // resolved/derived key to bind (may be null pre-binding)
}): Promise<RegisterResult>;
```

Binding rules:
1. Look up existing agent by `did`.
2. **No existing row** → insert with `pubkey = input.pubkey ?? null`; ensure CRM
   overlay (`agentCrm` Growth default) as today. Return `ok:true`.
3. **Existing row, stored `pubkey` is null** → adopt: update stored `pubkey` to
   `input.pubkey` (if provided), bump `lastSeenAt`/`displayName`. Return `ok:true`.
4. **Existing row, stored `pubkey` non-null:**
   - if `input.pubkey` is provided and **differs** from stored → return
     `ok:false, reason:"identity_key_mismatch"` (do **not** update anything).
   - otherwise bump `lastSeenAt`/`displayName`, return `ok:true`.

Implementation note: do this as an explicit select-then-write (the current
single `onConflictDoUpdate` cannot express the mismatch rejection). Wrap the
read+write so concurrent first-handshakes don't both adopt different keys — use a
conditional `UPDATE ... WHERE pubkey IS NULL` for the adopt path and re-check.

### 2.5 Rework `verifyIdentity` (`services/a2a/identity.ts`)

New signature + flow:

```ts
export async function verifyIdentity(
  did: string | undefined,
  signature: string | undefined,
  displayName?: string,
  pubkey?: string,
): Promise<IdentityResult>;
```

Ordered checks (return first failure with a precise `reason`):
1. `missing_credentials` — `did` or `signature` absent.
2. `parseDid(did)` → on throw, `did_malformed` / `did_method_unsupported`
   (propagate the typed reason). Use the **normalized** DID from here on.
3. `verifySignature(normalizedDid, signature)` (unchanged mock) → else
   `signature_verification_failed`.
4. `isRevoked(normalizedDid)` → else `agent_revoked`.
5. Compute the key to bind:
   `const derived = deriveKeyFromDid(parsed); const keyToBind = derived ?? pubkey ?? null;`
   - If method is `web` and there is **no** existing binding and `keyToBind` is
     null → `pubkey_required_for_method` (did:web must present a pubkey on first
     handshake).
6. `registerAgent({ did: normalizedDid, displayName, pubkey: keyToBind })`:
   - if `ok:false` → return `{ ok:false, reason:"identity_key_mismatch" }`.
   - else return `{ ok:true, did: normalizedDid }`.

`IdentityResult` already carries `{ ok, did, reason? }` — keep it; ensure the
normalized DID is what flows downstream (the gate uses `identity.did`).

### 2.6 Thread `pubkey` through `gateAction` (`services/a2a/gate.ts`)

Add `pubkey?: string` to the `gateAction` opts and pass it into `verifyIdentity`.
No other gate logic changes. Denials already surface `gate.reason` to the agent.

---

## 3. Out of scope (do NOT do)

- No real cryptographic signature verification (keep `sig::<did>`).
- No DB migration (the `pubkey` column exists).
- No server-side DID generation.
- No changes to the reputation/rules/offers engines.
- No new dependencies unless strictly needed for did:key decode — and if added,
  confine usage to `deriveKeyFromDid`. (Prefer **no** dependency for the MVP; the
  MSI-substring fingerprint is acceptable and documented as a seam.)

---

## 4. Acceptance criteria

1. `GET /.well-known/agent-card.json` and the `describe_service` tool both return
   the enriched `identification` block (accepted methods, recommendation,
   proofOfControl, keyBinding, `pubkey` credential field).
2. A malformed or unsupported DID (e.g. `did:sov:xyz`, `not-a-did`) is rejected
   on any identified tool with reason `did_malformed` / `did_method_unsupported`.
3. **TOFU happy path:** first identified call from a new `did:key` agent succeeds
   and persists a non-null `agents.pubkey` derived from the DID.
4. **Hijack blocked:** after a `did:key`/`did:web` DID is bound to a key, a call
   presenting the **same DID** but a **different `pubkey`** is rejected with
   `identity_key_mismatch`; stored binding is unchanged.
5. **did:web first handshake without pubkey** is rejected with
   `pubkey_required_for_method`; with a pubkey it binds and subsequent calls
   reusing that pubkey succeed.
6. Existing seeded agents (`did:web:openclaw.ai`, `did:web:hermes.bot`) still
   work end-to-end (note: they currently have null pubkey → they adopt on first
   live handshake; that is expected).
7. `npm run typecheck` and `npm run lint` pass. `npm run build` succeeds.

---

## 5. Tests to add (`services/a2a/__tests__/` or co-located `*.test.ts`)

> If no test runner exists yet, add **Vitest** (`vitest`, `@vitest/coverage` not
> required) + a `"test": "vitest run"` script. Keep tests pure where possible.

- `did.test.ts` (pure):
  - parses valid `did:key` and `did:web`; normalizes prefix + did:web domain.
  - rejects unsupported method, empty MSI, malformed strings.
  - `deriveKeyFromDid` returns a stable fingerprint for did:key, null for did:web.
- `identity.test.ts` (may stub the DB layer / `registerAgent`):
  - missing creds, malformed DID, bad signature, revoked → correct reasons.
  - TOFU adopt on first use; mismatch rejection on second use with different key.
  - did:web without pubkey rejected on first handshake.

---

## 6. Companion (docs only, no server code) — DID generation in the agent skill

Add a short section to `README.md` (or `docs/`) showing skill authors the
**client-side** pattern (the server stays a pure verifier):

1. Generate an Ed25519 keypair once; derive a `did:key`; **persist the private
   key** (stable identity → reputation accrues across sessions).
2. Sign the challenge per request; present `did` (+ `pubkey` for did:web).
3. Reuse the DID forever; rotate only on compromise (a new DID = new reputation).

Pseudocode is sufficient; do not add a runtime dependency to the app for this.

---

## 7. Suggested commit breakdown

1. `feat(a2a): did parsing/validation module (did.ts) + tests`
2. `feat(a2a): enrich identification scheme (methods, recommendation, key binding)`
3. `feat(a2a): TOFU pubkey binding in registerAgent + verifyIdentity`
4. `feat(mcp): thread optional pubkey credential through gate + tools`
5. `test(a2a): identity + did unit tests`
6. `docs: skill-side DID generation guidance`
