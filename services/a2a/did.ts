/**
 * DID parsing / validation / key derivation (pure, dependency-light).
 *
 * Strengthens agent identification so DID **method negotiation** and **anti-hijack
 * key binding** are correct-by-construction. This module does NOT verify
 * signatures (that stays mock per plan §15.3) — it validates the DID string,
 * normalizes it, and exposes the seam where real `did:key` decoding lands.
 *
 * No DB, no network: fully unit-testable.
 */

export const ACCEPTED_DID_METHODS = ["key", "web"] as const;
export type DidMethod = (typeof ACCEPTED_DID_METHODS)[number];

export type DidErrorReason = "did_malformed" | "did_method_unsupported";

/** Typed error carrying a machine-readable reason for the identity layer. */
export class DidError extends Error {
  readonly reason: DidErrorReason;
  constructor(reason: DidErrorReason, message?: string) {
    super(message ?? reason);
    this.name = "DidError";
    this.reason = reason;
  }
}

export interface ParsedDid {
  /** Normalized full DID (lowercased `did:<method>:` prefix; did:web domain lowercased). */
  did: string;
  method: DidMethod;
  methodSpecificId: string;
}

// Strict syntax for accepted methods. MSI characters cover did:key multibase
// and did:web (domain + optional `:`-delimited path, percent-encoded ports).
const ACCEPTED_DID_SYNTAX = /^did:(key|web):[A-Za-z0-9._:%-]+$/i;
// Generic shape used first so we can distinguish "unknown method" from "malformed".
const GENERIC_DID_SHAPE = /^did:([a-zA-Z0-9]+):(.+)$/i;

/**
 * Parse + validate a DID against the accepted methods.
 *  - Enforces syntax and rejects unknown methods with a precise reason.
 *  - Normalizes: trims; lowercases the `did:<method>:` prefix. For did:web the
 *    domain portion is lowercased; the did:key MSI is preserved (case-sensitive
 *    multibase).
 * Throws {@link DidError} on failure.
 */
export function parseDid(raw: string): ParsedDid {
  if (typeof raw !== "string") {
    throw new DidError("did_malformed", "DID must be a string");
  }
  const trimmed = raw.trim();

  const generic = GENERIC_DID_SHAPE.exec(trimmed);
  if (!generic) {
    throw new DidError("did_malformed", `Malformed DID: ${raw}`);
  }

  const method = generic[1].toLowerCase();
  if (!ACCEPTED_DID_METHODS.includes(method as DidMethod)) {
    throw new DidError(
      "did_method_unsupported",
      `Unsupported DID method: did:${method}`,
    );
  }

  if (!ACCEPTED_DID_SYNTAX.test(trimmed)) {
    throw new DidError("did_malformed", `Malformed DID: ${raw}`);
  }

  const rawMsi = generic[2];
  let methodSpecificId: string;
  if (method === "web") {
    // did:web MSI = domain[:port][:path...]. Lowercase only the domain segment.
    const firstColon = rawMsi.indexOf(":");
    methodSpecificId =
      firstColon === -1
        ? rawMsi.toLowerCase()
        : rawMsi.slice(0, firstColon).toLowerCase() + rawMsi.slice(firstColon);
  } else {
    // did:key MSI is a case-sensitive multibase string — keep verbatim.
    methodSpecificId = rawMsi;
  }

  if (methodSpecificId.length === 0) {
    throw new DidError("did_malformed", "Empty method-specific id");
  }

  return {
    did: `did:${method}:${methodSpecificId}`,
    method: method as DidMethod,
    methodSpecificId,
  };
}

/**
 * Derive the verification-key fingerprint embedded in the DID, when the method
 * carries one.
 *
 * - `did:key`: the key is embedded in the multibase MSI. For the MVP we return a
 *   stable fingerprint built from the MSI (no decode required). **Seam:** real
 *   `did:key` support decodes multibase base58btc + multicodec `0xed01`
 *   (Ed25519) to the raw public key here, without changing callers.
 * - `did:web`: the key lives in the resolved DID document, not in the DID — so
 *   this returns `null` (the caller must accept a presented `pubkey`).
 */
export function deriveKeyFromDid(parsed: ParsedDid): string | null {
  if (parsed.method === "key") {
    return `did:key:${parsed.methodSpecificId}`;
  }
  return null;
}
