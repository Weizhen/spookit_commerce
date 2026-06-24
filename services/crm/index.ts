/**
 * Agent CRM service.
 *
 * A CRM overlay on connected buyer agents: identity, curated segment, LTV,
 * order history, notes/tags. The owner (or a business-side agent via the admin
 * API) segments agents and applies CRM-scoped commercial rules — making the
 * rules engine CRM-aware (see services/commerce/rules.ts).
 */
import { desc, eq, sql } from "drizzle-orm";

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

/**
 * Register or refresh an agent on a successful handshake (self-identification).
 * Creates the agent row + a default CRM overlay if it is the first time we see
 * this DID. Returns the agent record.
 */
export async function registerAgent(input: {
  did: string;
  displayName?: string;
  pubkey?: string;
}): Promise<Agent> {
  const [agent] = await db
    .insert(agents)
    .values({
      did: input.did,
      displayName: input.displayName ?? "Unnamed Agent",
      pubkey: input.pubkey,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: agents.did,
      set: {
        displayName: input.displayName ?? "Unnamed Agent",
        lastSeenAt: new Date(),
      },
    })
    .returning();

  // Ensure a CRM overlay exists; default new agents to the Growth segment.
  await db
    .insert(agentCrm)
    .values({ agentDid: input.did, segment: "Growth" })
    .onConflictDoNothing({ target: agentCrm.agentDid });

  return agent;
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
