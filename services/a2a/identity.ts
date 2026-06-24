/**
 * A2A identification scheme (stateless).
 *
 * Decision (per the plan §15.3): DID + signed nonce, declared in the handshake,
 * **mock-verified** for the MVP. To keep MCP genuinely stateless (no session /
 * nonce store), identification is **per-request**: every identified tool call
 * carries `did` + `signature`, and the signature is verified on the spot.
 *
 * The mock signature is `sig::<did>` (matches the demo's `verify_signature`).
 * The interface is shaped so a real elliptic-curve / DID-document verifier can
 * be dropped in later without changing callers.
 */
import { verifySignature } from "@/services/commerce/reputation";
import { isRevoked, registerAgent } from "@/services/crm";

export const IDENTIFICATION_SCHEME = {
  method: "did-signed-nonce",
  description:
    "Present your DID and a signature over a server-issued nonce. For the MVP " +
    "the signature is mock-verified as `sig::<did>`; production will verify a " +
    "real signature against the DID document's verification key.",
  // Where to present credentials on an identified MCP tool call.
  credentialFields: { did: "did", signature: "signature" },
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
 * Verify an identified call. On success, the agent is registered/refreshed
 * (rows are created on first successful handshake — self-identification).
 */
export async function verifyIdentity(
  did: string | undefined,
  signature: string | undefined,
  displayName?: string,
): Promise<IdentityResult> {
  if (!did || !signature) {
    return {
      ok: false,
      did: did ?? "",
      reason: "missing_credentials: did + signature are required",
    };
  }
  if (!verifySignature(did, signature)) {
    return { ok: false, did, reason: "signature_verification_failed" };
  }
  if (await isRevoked(did)) {
    return { ok: false, did, reason: "agent_revoked" };
  }
  await registerAgent({ did, displayName });
  return { ok: true, did };
}
