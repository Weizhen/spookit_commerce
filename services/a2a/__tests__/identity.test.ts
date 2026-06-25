import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the DB-backed layers so identity logic is tested in isolation. The mock
// signature mirrors services/commerce/reputation#verifySignature (`sig::<did>`).
vi.mock("@/services/commerce/reputation", () => ({
  verifySignature: (did: string, sig: string) => sig === `sig::${did}`,
}));
vi.mock("@/services/crm", () => ({
  isRevoked: vi.fn(),
  registerAgent: vi.fn(),
  getAgentKeyBinding: vi.fn(),
}));

import { getAgentKeyBinding, isRevoked, registerAgent } from "@/services/crm";
import { verifyIdentity } from "../identity";

const mockIsRevoked = vi.mocked(isRevoked);
const mockRegister = vi.mocked(registerAgent);
const mockBinding = vi.mocked(getAgentKeyBinding);

const okRegister = (boundKey: string | null = null) =>
  ({ ok: true, agent: { did: "x" } as never, boundKey }) as const;

const DID_WEB = "did:web:hermes.bot";
const DID_KEY = "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnn";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsRevoked.mockResolvedValue(false);
  mockRegister.mockResolvedValue(okRegister());
  mockBinding.mockResolvedValue({ exists: false, pubkey: null });
});

describe("verifyIdentity — credential + method validation", () => {
  it("rejects missing credentials", async () => {
    const r = await verifyIdentity(undefined, undefined);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_credentials");
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("rejects a malformed DID", async () => {
    const r = await verifyIdentity("not-a-did", "sig::not-a-did");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("did_malformed");
  });

  it("rejects an unsupported DID method", async () => {
    const r = await verifyIdentity("did:sov:xyz", "sig::did:sov:xyz");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("did_method_unsupported");
  });

  it("rejects a bad signature", async () => {
    const r = await verifyIdentity(DID_WEB, "wrong-signature", undefined, "pk");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("signature_verification_failed");
  });

  it("rejects a revoked agent", async () => {
    mockIsRevoked.mockResolvedValue(true);
    const r = await verifyIdentity(DID_WEB, `sig::${DID_WEB}`, undefined, "pk");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("agent_revoked");
  });

  it("normalizes the DID before binding and downstream use", async () => {
    mockBinding.mockResolvedValue({ exists: true, pubkey: "pk" });
    const r = await verifyIdentity("DID:WEB:Hermes.Bot", `sig::${DID_WEB}`);
    expect(r.ok).toBe(true);
    expect(r.did).toBe(DID_WEB);
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ did: DID_WEB }),
    );
  });
});

describe("verifyIdentity — TOFU key binding", () => {
  it("adopts a did:key binding on first use (key derived from DID)", async () => {
    const r = await verifyIdentity(DID_KEY, `sig::${DID_KEY}`);
    expect(r.ok).toBe(true);
    expect(r.did).toBe(DID_KEY);
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ did: DID_KEY, pubkey: DID_KEY }),
    );
  });

  it("rejects a hijack (same DID, different key) as identity_key_mismatch", async () => {
    mockRegister.mockResolvedValue({
      ok: false,
      reason: "identity_key_mismatch",
    });
    const r = await verifyIdentity(DID_KEY, `sig::${DID_KEY}`);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("identity_key_mismatch");
  });

  it("rejects a first-time did:web handshake without a pubkey", async () => {
    mockBinding.mockResolvedValue({ exists: false, pubkey: null });
    const r = await verifyIdentity(DID_WEB, `sig::${DID_WEB}`);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("pubkey_required_for_method");
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("binds a first-time did:web handshake when a pubkey is presented", async () => {
    const r = await verifyIdentity(DID_WEB, `sig::${DID_WEB}`, "Hermes", "pk-1");
    expect(r.ok).toBe(true);
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ did: DID_WEB, pubkey: "pk-1" }),
    );
  });

  it("lets an already-bound did:web agent through without re-presenting a pubkey", async () => {
    mockBinding.mockResolvedValue({ exists: true, pubkey: "pk-1" });
    const r = await verifyIdentity(DID_WEB, `sig::${DID_WEB}`);
    expect(r.ok).toBe(true);
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ did: DID_WEB, pubkey: null }),
    );
  });
});
