/**
 * Read-only analytics for the dashboard. Aggregates the transaction log and
 * order data into decision-grade KPIs (decision mix, reputation distribution,
 * revenue / refund rollups, live activity feed).
 */
import { desc, gt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { orders, refunds, transactions } from "@/db/commerce/schema";
import type { Decision } from "./types";

export interface OpsSnapshot {
  totalRequests: number;
  avgRank: number;
  decisionMix: Record<Decision, number>;
  premiumConversionPct: number;
  recent: RecentTransaction[];
}

export interface RecentTransaction {
  id: number;
  ts: string;
  did: string;
  intent: string;
  rank: number;
  decision: string;
}

const EMPTY_MIX: Record<Decision, number> = {
  PREMIUM: 0,
  STANDARD: 0,
  THROTTLED: 0,
  REJECTED: 0,
};

function mapTransactionRow(r: {
  id: number;
  ts: Date | string;
  did: string;
  intent: string;
  rank: number;
  decision: string;
}): RecentTransaction {
  return {
    ...r,
    ts: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
  };
}

async function getDecisionMixAndTotals() {
  const mixRows = await db
    .select({
      decision: transactions.decision,
      count: sql<number>`count(*)`,
      avgRank: sql<number>`coalesce(avg(${transactions.rank}), 0)`,
    })
    .from(transactions)
    .groupBy(transactions.decision);

  const decisionMix = { ...EMPTY_MIX };
  let total = 0;
  let rankWeighted = 0;
  for (const r of mixRows) {
    const c = Number(r.count);
    total += c;
    rankWeighted += Number(r.avgRank) * c;
    if (r.decision in decisionMix) {
      decisionMix[r.decision as Decision] = c;
    }
  }

  return {
    totalRequests: total,
    avgRank: total > 0 ? Math.round((rankWeighted / total) * 10) / 10 : 0,
    decisionMix,
    premiumConversionPct:
      total > 0 ? Math.round((decisionMix.PREMIUM / total) * 1000) / 10 : 0,
  };
}

export async function getRecentTransactions(
  limit = 25,
): Promise<RecentTransaction[]> {
  const rows = await db
    .select({
      id: transactions.id,
      ts: transactions.ts,
      did: transactions.did,
      intent: transactions.intent,
      rank: transactions.rank,
      decision: transactions.decision,
    })
    .from(transactions)
    .orderBy(desc(transactions.id))
    .limit(limit);

  return rows.map(mapTransactionRow);
}

/** Incremental feed: transactions with id strictly greater than `afterId`. */
export async function getTransactionsAfter(
  afterId: number,
  limit = 25,
): Promise<RecentTransaction[]> {
  if (afterId <= 0) return getRecentTransactions(limit);

  const rows = await db
    .select({
      id: transactions.id,
      ts: transactions.ts,
      did: transactions.did,
      intent: transactions.intent,
      rank: transactions.rank,
      decision: transactions.decision,
    })
    .from(transactions)
    .where(gt(transactions.id, afterId))
    .orderBy(desc(transactions.id))
    .limit(limit);

  return rows.map(mapTransactionRow);
}

export interface DashboardStats {
  totalRequests: number;
  avgRank: number;
  decisionMix: Record<Decision, number>;
  premiumConversionPct: number;
  revenue: RevenueSnapshot;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [stats, revenue] = await Promise.all([
    getDecisionMixAndTotals(),
    getRevenueSnapshot(),
  ]);
  return { ...stats, revenue };
}

export async function getOpsSnapshot(limit = 25): Promise<OpsSnapshot> {
  const [stats, recent] = await Promise.all([
    getDecisionMixAndTotals(),
    getRecentTransactions(limit),
  ]);

  return { ...stats, recent };
}

export interface RevenueSnapshot {
  paidOrders: number;
  grossRevenue: number;
  refundedAmount: number;
  netRevenue: number;
}

export async function getRevenueSnapshot(): Promise<RevenueSnapshot> {
  const [ordersAgg] = await db
    .select({
      paid: sql<number>`count(*) filter (where ${orders.status} = 'paid')`,
      gross: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} in ('paid','refunded')), 0)`,
    })
    .from(orders);

  const [refundAgg] = await db
    .select({
      refunded: sql<number>`coalesce(sum(${refunds.amount}) filter (where ${refunds.status} = 'approved'), 0)`,
    })
    .from(refunds);

  const gross = Number(ordersAgg?.gross ?? 0);
  const refunded = Number(refundAgg?.refunded ?? 0);
  return {
    paidOrders: Number(ordersAgg?.paid ?? 0),
    grossRevenue: gross,
    refundedAmount: refunded,
    netRevenue: Math.round((gross - refunded) * 100) / 100,
  };
}
