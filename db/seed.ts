/**
 * Seed script — ports the demo's mock CRM/subscription/rule seeds and adds the
 * MVP's catalog products + demo buyer agents (OpenClaw / Hermes).
 *
 * Run with: `npm run db:seed` (requires DATABASE_URL in .env). Idempotent:
 * uses upserts / "seed only if empty" so re-running is safe.
 */
import { sql } from "drizzle-orm";

import { db } from "./client";
import { products } from "./catalog/schema";
import {
  agentCrm,
  agents,
  commercialRules,
  crmProfiles,
  subscriptions,
} from "./commerce/schema";

// --- CRM profiles (ported from database.py SEED_PROFILES) ------------------

const SEED_PROFILES = [
  {
    did: "DID_1",
    displayName: "Acme Capital Procurement Agent",
    segment: "VIP",
    ltvUsd: 1_250_000,
    ltvScore: 100,
    known: true,
    notes: "High LTV VIP customer. Repeat binding contracts.",
  },
  {
    did: "DID_2",
    displayName: "Unknown / New User",
    segment: "UNKNOWN",
    ltvUsd: 0,
    ltvScore: 10,
    known: false,
    notes: "Unrecognized DID. No commercial history.",
  },
];

// --- Subscriptions (ported from SEED_SUBSCRIPTIONS) ------------------------

const SEED_SUBSCRIPTIONS = [
  {
    did: "SUB_ACME",
    displayName: "Acme Procurement Agent",
    categories: ["compute", "data_feeds", "security"],
    promoTypes: ["discount", "volume_deal", "early_access"],
    minDiscountPct: 8,
    engagementPropensity: 0.85,
    typicalOrderValueUsd: 180_000,
  },
  {
    did: "SUB_NEXUS",
    displayName: "Nexus Logistics Agent",
    categories: ["logistics", "energy"],
    promoTypes: ["bundle", "volume_deal"],
    minDiscountPct: 15,
    engagementPropensity: 0.6,
    typicalOrderValueUsd: 90_000,
  },
  {
    did: "SUB_ORION",
    displayName: "Orion Data Desk Agent",
    categories: ["data_feeds"],
    promoTypes: ["early_access", "discount"],
    minDiscountPct: 5,
    engagementPropensity: 0.7,
    typicalOrderValueUsd: 45_000,
  },
  {
    did: "SUB_VOLT",
    displayName: "Volt Energy Trading Agent",
    categories: ["energy", "compute"],
    promoTypes: ["volume_deal"],
    minDiscountPct: 20,
    engagementPropensity: 0.5,
    typicalOrderValueUsd: 320_000,
  },
  {
    did: "SUB_SENTRY",
    displayName: "Sentry Security Agent",
    categories: ["security"],
    promoTypes: ["discount", "bundle", "early_access"],
    minDiscountPct: 12,
    engagementPropensity: 0.65,
    typicalOrderValueUsd: 60_000,
  },
  {
    did: "SUB_PENNY",
    displayName: "PennyWise Reseller Agent",
    categories: ["compute", "data_feeds", "logistics", "energy", "security"],
    promoTypes: ["discount", "bundle"],
    minDiscountPct: 25,
    engagementPropensity: 0.9,
    typicalOrderValueUsd: 30_000,
  },
];

// --- Commercial rules (ported from SEED_RULES; CRM fields default to ANY) ---

const SEED_RULES = [
  {
    name: "Platinum VIP Floor",
    layer: "BASE",
    priority: 1,
    enabled: true,
    segment: "VIP",
    intent: "ANY",
    minRank: 90,
    maxRank: 100,
    action: "SET_TIER",
    tier: "PLATINUM",
    discountPct: 20,
    message: "VIP agents at peak trust receive platinum treatment.",
  },
  {
    name: "Gold High Trust",
    layer: "BASE",
    priority: 2,
    enabled: true,
    segment: "ANY",
    intent: "ANY",
    minRank: 70,
    maxRank: 100,
    action: "SET_TIER",
    tier: "GOLD",
    discountPct: 10,
    message: "High-trust agents unlock gold pricing.",
  },
  {
    name: "Standard Service",
    layer: "BASE",
    priority: 3,
    enabled: true,
    segment: "ANY",
    intent: "ANY",
    minRank: 40,
    maxRank: 70,
    action: "ALLOW",
    tier: "STANDARD",
    discountPct: 0,
    message: "Standard list pricing for mid-trust agents.",
  },
  {
    name: "Throttle Low Trust",
    layer: "BASE",
    priority: 4,
    enabled: true,
    segment: "ANY",
    intent: "ANY",
    minRank: 0,
    maxRank: 40,
    action: "THROTTLE",
    tier: "STANDARD",
    discountPct: 0,
    message: "Low-trust agents are rate-limited to protect margin.",
  },
  {
    name: "VIP Loyalty Bonus",
    layer: "CAMPAIGN",
    priority: 1,
    enabled: true,
    segment: "VIP",
    intent: "ANY",
    minRank: 70,
    maxRank: 100,
    action: "ADD_DISCOUNT",
    tier: "PLATINUM",
    discountPct: 5,
    message: "Active loyalty promo: +5% for premium VIP agents.",
  },
  {
    name: "New-Agent Winback",
    layer: "CAMPAIGN",
    priority: 2,
    enabled: false,
    segment: "UNKNOWN",
    intent: "ANY",
    minRank: 40,
    maxRank: 100,
    action: "SET_TIER",
    tier: "GOLD",
    discountPct: 8,
    message: "Promo: temporarily upgrade qualifying new agents to gold.",
  },
];

// --- Catalog products (new for the MVP) ------------------------------------

const SEED_PRODUCTS = [
  {
    sku: "CMP-RSV-A100",
    name: "Reserved A100 Compute Cluster",
    category: "compute",
    description:
      "8x A100 80GB reserved cluster, 1-month term. Burst-capable, SLA-backed.",
    price: "120000.00",
    stock: 12,
  },
  {
    sku: "CMP-SPOT-CPU",
    name: "Spot CPU Capacity Block",
    category: "compute",
    description: "Interruptible vCPU capacity block, 10k core-hours.",
    price: "8500.00",
    stock: 200,
  },
  {
    sku: "DATA-RT-FX",
    name: "Real-Time FX Data Feed",
    category: "data_feeds",
    description: "Sub-millisecond consolidated FX tick feed, annual license.",
    price: "60000.00",
    stock: 25,
  },
  {
    sku: "DATA-SAT-IMG",
    name: "Satellite Imagery Stream",
    category: "data_feeds",
    description: "Daily-refresh multispectral imagery API, per-AOI license.",
    price: "42000.00",
    stock: 40,
  },
  {
    sku: "LOG-FREIGHT-LANE",
    name: "Priority Freight Lane",
    category: "logistics",
    description: "Guaranteed-capacity freight lane allocation, quarterly.",
    price: "90000.00",
    stock: 8,
  },
  {
    sku: "ENR-HEDGE-CAP",
    name: "Hedged Energy Capacity",
    category: "energy",
    description: "Blended spot + hedged power capacity, 5 MW block.",
    price: "300000.00",
    stock: 4,
  },
  {
    sku: "SEC-SUITE-ENT",
    name: "Enterprise Security Suite",
    category: "security",
    description: "Full threat-intel + response suite, annual subscription.",
    price: "75000.00",
    stock: 30,
  },
  {
    sku: "SEC-DID-VAULT",
    name: "DID Key Vault",
    category: "security",
    description: "Managed DID key custody + rotation for agent fleets.",
    price: "18000.00",
    stock: 100,
  },
];

// --- Demo buyer agents (seeded so the A2A surface has known identities) -----

const SEED_AGENTS = [
  {
    did: "did:web:openclaw.ai",
    displayName: "OpenClaw Buyer Agent",
    segment: "VIP",
  },
  {
    did: "did:web:hermes.bot",
    displayName: "Hermes Procurement Agent",
    segment: "Growth",
  },
];

async function main() {
  console.log("Seeding Spookit commerce + catalog ...");

  // CRM profiles
  for (const p of SEED_PROFILES) {
    await db
      .insert(crmProfiles)
      .values(p)
      .onConflictDoUpdate({ target: crmProfiles.did, set: p });
  }

  // Subscriptions
  for (const s of SEED_SUBSCRIPTIONS) {
    await db
      .insert(subscriptions)
      .values({ ...s, active: true })
      .onConflictDoUpdate({
        target: subscriptions.did,
        set: { ...s, active: true },
      });
  }

  // Commercial rules — seed only if none exist (preserve owner edits).
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commercialRules);
  if (Number(count) === 0) {
    await db.insert(commercialRules).values(SEED_RULES);
    console.log(`  + ${SEED_RULES.length} commercial rules`);
  } else {
    console.log(`  = commercial rules left untouched (${count} existing)`);
  }

  // Catalog products
  for (const prod of SEED_PRODUCTS) {
    await db
      .insert(products)
      .values(prod)
      .onConflictDoUpdate({ target: products.sku, set: prod });
  }

  // Demo agents + CRM overlay
  for (const a of SEED_AGENTS) {
    await db
      .insert(agents)
      .values({ did: a.did, displayName: a.displayName })
      .onConflictDoUpdate({
        target: agents.did,
        set: { displayName: a.displayName },
      });
    await db
      .insert(agentCrm)
      .values({ agentDid: a.did, segment: a.segment })
      .onConflictDoUpdate({
        target: agentCrm.agentDid,
        set: { segment: a.segment },
      });
  }

  console.log(
    `Seed complete: ${SEED_PROFILES.length} CRM profiles, ` +
      `${SEED_SUBSCRIPTIONS.length} subscriptions, ${SEED_PRODUCTS.length} products, ` +
      `${SEED_AGENTS.length} demo agents.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
