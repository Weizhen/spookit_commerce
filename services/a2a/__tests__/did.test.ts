import { describe, expect, it } from "vitest";

import { DidError, deriveKeyFromDid, parseDid } from "../did";

describe("parseDid", () => {
  it("parses a valid did:key and preserves the case-sensitive MSI", () => {
    const msi = "z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK";
    const parsed = parseDid(`did:key:${msi}`);
    expect(parsed.method).toBe("key");
    expect(parsed.methodSpecificId).toBe(msi);
    expect(parsed.did).toBe(`did:key:${msi}`);
  });

  it("parses a valid did:web", () => {
    const parsed = parseDid("did:web:hermes.bot");
    expect(parsed.method).toBe("web");
    expect(parsed.methodSpecificId).toBe("hermes.bot");
    expect(parsed.did).toBe("did:web:hermes.bot");
  });

  it("normalizes the method prefix to lowercase", () => {
    const parsed = parseDid("DID:WEB:Hermes.Bot");
    expect(parsed.did).toBe("did:web:hermes.bot");
  });

  it("lowercases only the did:web domain, keeping the path", () => {
    const parsed = parseDid("did:web:Example.COM:Path:To");
    expect(parsed.did).toBe("did:web:example.com:Path:To");
    expect(parsed.methodSpecificId).toBe("example.com:Path:To");
  });

  it("trims surrounding whitespace", () => {
    expect(parseDid("  did:web:hermes.bot  ").did).toBe("did:web:hermes.bot");
  });

  it("rejects an unsupported method with did_method_unsupported", () => {
    expect.assertions(2);
    try {
      parseDid("did:sov:xyz");
    } catch (e) {
      expect(e).toBeInstanceOf(DidError);
      expect((e as DidError).reason).toBe("did_method_unsupported");
    }
  });

  it.each(["", "not-a-did", "did:web:", "did:key:", "did::msi", "didweb:x"])(
    "rejects malformed input %j with did_malformed",
    (raw) => {
      try {
        parseDid(raw);
        throw new Error("expected parseDid to throw");
      } catch (e) {
        expect(e).toBeInstanceOf(DidError);
        expect((e as DidError).reason).toBe("did_malformed");
      }
    },
  );
});

describe("deriveKeyFromDid", () => {
  it("returns a stable fingerprint for did:key", () => {
    const did = parseDid("did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnn");
    const a = deriveKeyFromDid(did);
    const b = deriveKeyFromDid(parseDid(did.did));
    expect(a).toBe("did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnn");
    expect(a).toBe(b);
  });

  it("returns null for did:web (key requires resolution)", () => {
    expect(deriveKeyFromDid(parseDid("did:web:hermes.bot"))).toBeNull();
  });
});
