/**
 * A2A identification scheme (stateless) + per-request identity verification.
 *
 * Decision (per the plan §15.3): DID + signed nonce, declared in the handshake,
 * **mock-verified** for the MVP. To keep MCP genuinely stateless (no session /
 * nonce store), identification is **per-request**: every identified tool call
 * carries `did` + `signature`, verified on the spot.
 *
 * This layer adds, around the unchanged mock signature:
 *  - **method negotiation** — only accepted DID methods (did:key, did:web) pass.
 *  - **trust-on-first-use (TOFU) key binding** — a DID is locked to the first
 *    public key seen for it; later calls presenting the same DID with a
 *    different key are rejected as `identity_key_mismatch`.
 *
 * The mock signature stays `sig::<did>` (see services/commerce/reputation.ts).
 * The seam for real DID-document verification is `did.ts#deriveKeyFromDid`.
 */
import { verifySignature } from "@/services/commerce/reputation";
import { getAgentKeyBinding, isRevoked, registerAgent } from "@/services/crm";
import { DidError, deriveKeyFromDid, parseDid } from "./did";
import type { ParsedDid } from "./did";

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
  // Where to present credentials on an identified MCP tool call.
  credentialFields: { did: "did", signature: "signature", pubkey: "pubkey" },
  keyBinding: "trust-on-first-use", // DID locked to first-seen public key
  // Stateless: no challenge round-trip required; sign per request.
  stateless: true,
  mockForMvp: true,
} as const;

export interface IdentityResult {
  ok: boolean;
  did: string;
  reason?: string;
}

/**
 * Verify an identified call. On success the agent is registered/refreshed and
 * its DID is bound (TOFU) to a public key. Returns the **normalized** DID so it
 * flows consistently downstream (the gate keys reputation/CRM off `did`).
 */
export async function verifyIdentity(
  did: string | undefined,
  signature: string | undefined,
  displayName?: string,
  pubkey?: string,
): Promise<IdentityResult> {
  if (!did || !signature) {
    return {
      ok: false,
      did: did ?? "",
      reason: "missing_credentials",
    };
  }

  // 1. Method negotiation + normalization.
  let parsed: ParsedDid;
  try {
    parsed = parseDid(did);
  } catch (e) {
    if (e instanceof DidError) return { ok: false, did, reason: e.reason };
    return { ok: false, did, reason: "did_malformed" };
  }
  const normalizedDid = parsed.did;

  // 2. Mock signature (unchanged) — verified against the normalized DID.
  if (!verifySignature(normalizedDid, signature)) {
    return {
      ok: false,
      did: normalizedDid,
      reason: "signature_verification_failed",
    };
  }

  // 3. Revocation.
  if (await isRevoked(normalizedDid)) {
    return { ok: false, did: normalizedDid, reason: "agent_revoked" };
  }

  // 4. Resolve the key to bind: did:key embeds it; did:web must present one on
  //    its first handshake (when no agent row exists yet).
  const keyToBind = deriveKeyFromDid(parsed) ?? pubkey ?? null;
  if (parsed.method === "web" && keyToBind === null) {
    const binding = await getAgentKeyBinding(normalizedDid);
    if (!binding.exists) {
      return {
        ok: false,
        did: normalizedDid,
        reason: "pubkey_required_for_method",
      };
    }
  }

  // 5. TOFU bind (rejects a same-DID / different-key hijack attempt).
  const result = await registerAgent({
    did: normalizedDid,
    displayName,
    pubkey: keyToBind,
  });
  if (!result.ok) {
    return { ok: false, did: normalizedDid, reason: result.reason };
  }

  return { ok: true, did: normalizedDid };
}
