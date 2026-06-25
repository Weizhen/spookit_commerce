/**
 * Agent CRM service.
 *
 * A CRM overlay on connected buyer agents: identity, curated segment, LTV,
 * order history, notes/tags. The owner (or a business-side agent via the admin
 * API) segments agents and applies CRM-scoped commercial rules — making the
 * rules engine CRM-aware (see services/commerce/rules.ts).
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  agentCrm,
  agentTags,
  agents,
  orders,
} from "@/db/commerce/schema";
import type { Agent, AgentCrm } from "@/db/commerce/schema";

export const CRM_SEGMENTS = [
  "VIP",
  "Growth",
  "Watchlist",
  "Blocked",
] as const;
export type CrmSegment = (typeof CRM_SEGMENTS)[number];

export type RegisterResult =
  | { ok: true; agent: Agent; boundKey: string | null }
  | { ok: false; reason: "identity_key_mismatch" };

/** Read the current TOFU key binding for a DID (cheap existence + pubkey check). */
export async function getAgentKeyBinding(
  did: string,
): Promise<{ exists: boolean; pubkey: string | null }> {
  const [agent] = await db
    .select({ pubkey: agents.pubkey })
    .from(agents)
    .where(eq(agents.did, did))
    .limit(1);
  if (!agent) return { exists: false, pubkey: null };
  return { exists: true, pubkey: agent.pubkey ?? null };
}

/** Ensure a CRM overlay exists; default new agents to the Growth segment. */
async function ensureCrmOverlay(did: string): Promise<void> {
  await db
    .insert(agentCrm)
    .values({ agentDid: did, segment: "Growth" })
    .onConflictDoNothing({ target: agentCrm.agentDid });
}

/**
 * Register or refresh an agent on a successful handshake (self-identification),
 * enforcing **trust-on-first-use** key binding:
 *
 *  - new DID            → insert, binding `pubkey` (may be null pre-binding).
 *  - existing, unbound  → adopt the presented key (conditional on still being
 *                          unbound, so concurrent first-handshakes can't both
 *                          adopt different keys).
 *  - existing, bound    → a *different* presented key is rejected
 *                          (`identity_key_mismatch`); same/absent key just
 *                          refreshes `lastSeenAt`/`displayName`.
 */
export async function registerAgent(input: {
  did: string;
  displayName?: string;
  pubkey?: string | null;
}): Promise<RegisterResult> {
  const displayName = input.displayName ?? "Unnamed Agent";
  const incomingKey = input.pubkey ?? null;

  const [existing] = await db
    .select()
    .from(agents)
    .where(eq(agents.did, input.did))
    .limit(1);

  // --- First time we see this DID -------------------------------------------
  if (!existing) {
    const [agent] = await db
      .insert(agents)
      .values({
        did: input.did,
        displayName,
        pubkey: incomingKey,
        lastSeenAt: new Date(),
      })
      // Guard a concurrent insert race: do not clobber a key bound by the
      // winning insert.
      .onConflictDoUpdate({
        target: agents.did,
        set: { displayName, lastSeenAt: new Date() },
      })
      .returning();
    await ensureCrmOverlay(input.did);

    if (
      incomingKey !== null &&
      agent.pubkey !== null &&
      agent.pubkey !== incomingKey
    ) {
      return { ok: false, reason: "identity_key_mismatch" };
    }
    return { ok: true, agent, boundKey: agent.pubkey ?? null };
  }

  // --- Existing row, not yet bound: adopt (TOFU) -----------------------------
  if (existing.pubkey === null) {
    if (incomingKey !== null) {
      // Conditional adopt: only binds while still unbound.
      await db
        .update(agents)
        .set({ pubkey: incomingKey, displayName, lastSeenAt: new Date() })
        .where(and(eq(agents.did, input.did), isNull(agents.pubkey)));
    } else {
      await db
        .update(agents)
        .set({ displayName, lastSeenAt: new Date() })
        .where(eq(agents.did, input.did));
    }

    const [after] = await db
      .select()
      .from(agents)
      .where(eq(agents.did, input.did))
      .limit(1);
    await ensureCrmOverlay(input.did);

    // A concurrent handshake may have adopted a different key first.
    if (
      incomingKey !== null &&
      after.pubkey !== null &&
      after.pubkey !== incomingKey
    ) {
      return { ok: false, reason: "identity_key_mismatch" };
    }
    return { ok: true, agent: after, boundKey: after.pubkey ?? null };
  }

  // --- Existing row, already bound -------------------------------------------
  if (incomingKey !== null && incomingKey !== existing.pubkey) {
    return { ok: false, reason: "identity_key_mismatch" };
  }
  const [updated] = await db
    .update(agents)
    .set({ displayName, lastSeenAt: new Date() })
    .where(eq(agents.did, input.did))
    .returning();
  return { ok: true, agent: updated, boundKey: updated.pubkey ?? null };
}

export interface CrmRecord {
  agent: Agent;
  crm: AgentCrm | null;
  tags: string[];
}

export async function getAgentRecord(did: string): Promise<CrmRecord | null> {
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.did, did))
    .limit(1);
  if (!agent) return null;

  const [crm] = await db
    .select()
    .from(agentCrm)
    .where(eq(agentCrm.agentDid, did))
    .limit(1);

  const tagRows = await db
    .select({ tag: agentTags.tag })
    .from(agentTags)
    .where(eq(agentTags.agentDid, did));

  return { agent, crm: crm ?? null, tags: tagRows.map((t) => t.tag) };
}

export async function listAgents(): Promise<CrmRecord[]> {
  const allAgents = await db.select().from(agents).orderBy(desc(agents.lastSeenAt));
  const records: CrmRecord[] = [];
  for (const agent of allAgents) {
    const [crm] = await db
      .select()
      .from(agentCrm)
      .where(eq(agentCrm.agentDid, agent.did))
      .limit(1);
    const tagRows = await db
      .select({ tag: agentTags.tag })
      .from(agentTags)
      .where(eq(agentTags.agentDid, agent.did));
    records.push({ agent, crm: crm ?? null, tags: tagRows.map((t) => t.tag) });
  }
  return records;
}

export async function setAgentSegment(
  did: string,
  segment: string,
): Promise<void> {
  await db
    .insert(agentCrm)
    .values({ agentDid: did, segment })
    .onConflictDoUpdate({
      target: agentCrm.agentDid,
      set: { segment },
    });
}

export async function revokeAgent(did: string): Promise<void> {
  await db.update(agents).set({ status: "revoked" }).where(eq(agents.did, did));
}

export async function isRevoked(did: string): Promise<boolean> {
  const [agent] = await db
    .select({ status: agents.status })
    .from(agents)
    .where(eq(agents.did, did))
    .limit(1);
  return agent?.status === "revoked";
}

/** Recompute an agent's CRM LTV + order count from its paid orders. */
export async function refreshAgentLtv(did: string): Promise<void> {
  const [agg] = await db
    .select({
      total: sql<number>`coalesce(sum(${orders.total}), 0)`,
      count: sql<number>`count(*)`,
      last: sql<Date | null>`max(${orders.createdAt})`,
    })
    .from(orders)
    .where(eq(orders.agentDid, did));

  await db
    .insert(agentCrm)
    .values({
      agentDid: did,
      ltvUsd: Number(agg?.total ?? 0),
      totalOrders: Number(agg?.count ?? 0),
      lastOrderAt: agg?.last ?? null,
    })
    .onConflictDoUpdate({
      target: agentCrm.agentDid,
      set: {
        ltvUsd: Number(agg?.total ?? 0),
        totalOrders: Number(agg?.count ?? 0),
        lastOrderAt: agg?.last ?? null,
      },
    });
}
