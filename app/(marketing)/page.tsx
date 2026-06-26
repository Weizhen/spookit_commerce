import type { ReactNode } from "react";
import Link from "next/link";

const BASE =
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
  "https://commerce.spookit.com";

const SKILL_REPO = "https://github.com/Weizhen/spookit_commerce";
const SKILL_PATH = `${SKILL_REPO}/tree/main/Skill`;

const AGENT_INSTALL_PROMPTS = {
  cursor: `Install the Spookit Commerce buyer skill from ${SKILL_PATH} into my skills directory as spookit-commerce-buyer. Read SKILL.md, connect to ${BASE}/api/mcp, and use identity did:web:hermes.bot with signature sig::did:web:hermes.bot. Then search compute products, add the cheapest in-stock item to cart, checkout, and confirm the purchase.`,
  openclaw: `Clone ${SKILL_REPO} and run: openclaw skills install ./spookit_commerce/Skill

Add the Spookit MCP gateway to my OpenClaw config (mcp-remote → ${BASE}/api/mcp). Use identity did:web:openclaw.ai and signature sig::did:web:openclaw.ai on every identified tool call. Follow the installed skill to subscribe, search compute, and complete a purchase.`,
  hermes: `Install the buyer skill from ${SKILL_PATH}. Connect to ${BASE}/api/mcp as did:web:hermes.bot (signature sig::did:web:hermes.bot). Follow SKILL.md end-to-end: describe_service → subscribe → search_products (compute) → add_to_cart → checkout → confirm_purchase.`,
} as const;

const FEATURES = [
  {
    title: "Reputation-aware pricing",
    body: "Every agent action is scored 0–100 from CRM LTV, declared intent, and behavior. Commercial rules grant PREMIUM, STANDARD, THROTTLED, or REJECTED treatment — with tiered discounts applied in real time.",
    icon: "shield",
  },
  {
    title: "MCP-native commerce",
    body: "Buyer agents connect over Streamable HTTP. Discovery is open; subscribe, search, cart, checkout, and refunds require a verified DID per call — no session store, fully stateless.",
    icon: "network",
  },
  {
    title: "CRM-aware policy",
    body: "Layered BASE → CAMPAIGN rules can target segments or individual agent DIDs. Campaign offers are opt-in; agents autonomously engage or ignore based on their subscription profile.",
    icon: "users",
  },
  {
    title: "Live operations console",
    body: "Owners oversee agent traffic, decision mix, catalog, campaigns, and governance from an industrial control dashboard — the same deploy, no CORS.",
    icon: "monitor",
  },
] as const;

const WORKFLOW = [
  {
    step: "01",
    title: "Stock the store",
    body: "Merchandisers load products and commercial policy through the owner portal. Catalog and rules live in Neon Postgres.",
  },
  {
    step: "02",
    title: "Agents discover",
    body: "Buyer agents read the public agent card and call describe_service to learn capabilities, terms, and the identification scheme.",
  },
  {
    step: "03",
    title: "Identify & subscribe",
    body: "Agents present a DID + signature on every identified call. They register offer preferences via subscribe.",
  },
  {
    step: "04",
    title: "Transact with tier pricing",
    body: "search_products returns yourPrice — tier-adjusted. Cart snapshots that price through checkout and confirm_purchase.",
  },
  {
    step: "05",
    title: "Oversee in the console",
    body: "Every scored request streams to the operations dashboard. Owners tune CRM, rules, and campaigns from the same domain.",
  },
];

function FeatureIcon({ name }: { name: (typeof FEATURES)[number]["icon"] }) {
  const paths: Record<string, ReactNode> = {
    shield: (
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    ),
    network: (
      <>
        <rect x="16" y="16" width="6" height="6" rx="1" />
        <rect x="2" y="16" width="6" height="6" rx="1" />
        <rect x="9" y="2" width="6" height="6" rx="1" />
        <path d="M12 8v8M5 16v-3a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    monitor: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  };
  return (
    <span className="marketing-feature-icon" aria-hidden>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[name]}
      </svg>
    </span>
  );
}

export default function MarketingPage() {
  return (
    <>
      <section className="marketing-hero">
        <div className="marketing-container marketing-hero-inner">
          <div className="marketing-eyebrow-badge">
            <span className="marketing-eyebrow-dot" />
            A2A commerce gateway
          </div>
          <h1 className="marketing-hero-title">
            A storefront that{" "}
            <span className="marketing-gradient-text">sells to machines</span>
          </h1>
          <p className="marketing-hero-lead">
            Reputation-aware gateway for autonomous buyer agents — discover,
            price, and transact over MCP while you oversee every decision from
            the operations console.
          </p>
          <div className="marketing-hero-actions">
            <Link
              href="/dashboard"
              className="marketing-btn marketing-btn-primary"
            >
              Open Operations Console →
            </Link>
            <a href="#test" className="marketing-btn marketing-btn-ghost">
              Connect an agent
            </a>
          </div>
          <div className="marketing-hero-meta">
            <span className="marketing-pill marketing-pill-live">Live</span>
            <code className="marketing-code">{BASE}/api/mcp</code>
          </div>
        </div>
      </section>

      {/* Concept */}
      <section id="concept" className="marketing-section marketing-section-alt">
        <div className="marketing-container">
          <div className="marketing-section-head marketing-section-head-center">
            <h2 className="marketing-section-title">
              Agent-to-agent, not human-to-cart
            </h2>
            <p className="marketing-section-lead">
              Traditional e-commerce assumes a browser and a checkout form. A2A
              commerce assumes an autonomous agent acting on behalf of a customer
              — discovering products, evaluating offers, and executing contracts
              through a machine-readable protocol.
            </p>
          </div>
          <div className="marketing-feature-grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="marketing-card marketing-feature-card">
                <FeatureIcon name={f.icon} />
                <h3 className="marketing-card-title">{f.title}</h3>
                <p className="marketing-card-body">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="marketing-section">
        <div className="marketing-container">
          <div className="marketing-section-head">
            <p className="marketing-eyebrow">How it works</p>
            <h2 className="marketing-section-title">From catalog to contract</h2>
          </div>
          <ol className="marketing-workflow">
            {WORKFLOW.map((w) => (
              <li key={w.step} className="marketing-workflow-step">
                <span className="marketing-workflow-num">{w.step}</span>
                <div>
                  <h3 className="marketing-card-title">{w.title}</h3>
                  <p className="marketing-card-body">{w.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Test it */}
      <section id="test" className="marketing-section marketing-section-alt">
        <div className="marketing-container">
          <div className="marketing-section-head marketing-section-head-center">
            <p className="marketing-eyebrow">Try it now</p>
            <h2 className="marketing-section-title">
              Install the skill and make your first trade
            </h2>
            <p className="marketing-section-lead">
              Paste one prompt into Cursor, OpenClaw, or Hermes — the agent
              installs the skill, wires the MCP gateway, and runs a test
              purchase. No manual config files required.
            </p>
          </div>

          <div className="marketing-test-grid">
            <div className="marketing-card marketing-card-code marketing-card-wide">
              <h3 className="marketing-card-title">
                1 · Paste into your agent
              </h3>
              <p className="marketing-card-body">
                Copy the prompt for your runtime. The agent clones{" "}
                <code>Skill/</code> from{" "}
                <a
                  href={SKILL_REPO}
                  className="marketing-inline-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {SKILL_REPO.replace("https://", "")}
                </a>
                , installs it, connects MCP, and walks the buyer flow.
              </p>
              <p className="marketing-prompt-label">Cursor</p>
              <pre className="marketing-pre">{AGENT_INSTALL_PROMPTS.cursor}</pre>
              <p className="marketing-prompt-label">OpenClaw</p>
              <pre className="marketing-pre">
                {AGENT_INSTALL_PROMPTS.openclaw}
              </pre>
              <p className="marketing-prompt-label">Hermes</p>
              <pre className="marketing-pre">{AGENT_INSTALL_PROMPTS.hermes}</pre>
            </div>

            <div className="marketing-card marketing-card-code">
              <h3 className="marketing-card-title">2 · Run the bundled buyer</h3>
              <p className="marketing-card-body">
                Defaults to the live endpoint and the Hermes demo identity (
                <code>did:web:hermes.bot</code>):
              </p>
              <pre className="marketing-pre">{`node Skill/scripts/buy.mjs \\
  --category compute --qty 1 --confirm`}</pre>
            </div>

            <div className="marketing-card marketing-card-code">
              <h3 className="marketing-card-title">3 · Manual install (optional)</h3>
              <p className="marketing-card-body">
                Prefer doing it yourself? Copy <code>Skill/</code> into your
                agent&apos;s skills directory and install the MCP SDK:
              </p>
              <pre className="marketing-pre">{`git clone ${SKILL_REPO}
# Cursor: ~/.cursor/skills/spookit-commerce-buyer/
# OpenClaw: openclaw skills install ./spookit_commerce/Skill

npm install @modelcontextprotocol/sdk`}</pre>
            </div>

            <div className="marketing-card marketing-card-code">
              <h3 className="marketing-card-title">4 · Wire MCP directly</h3>
              <p className="marketing-card-body">
                Streamable HTTP endpoint and agent card for any MCP host:
              </p>
              <pre className="marketing-pre">{`Endpoint:  ${BASE}/api/mcp
Discovery: ${BASE}/.well-known/agent-card.json

# stdio-only hosts — bridge with mcp-remote:
{
  "mcpServers": {
    "spookit": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${BASE}/api/mcp"]
    }
  }
}`}</pre>
            </div>

            <div className="marketing-card marketing-card-code">
              <h3 className="marketing-card-title">5 · Identity on every call</h3>
              <p className="marketing-card-body">
                Identified tools require <code>did</code> +{" "}
                <code>signature</code> as tool arguments (MVP mock:{" "}
                <code>sig::&lt;did&gt;</code>):
              </p>
              <pre className="marketing-pre">{`const id = {
  did: "did:web:hermes.bot",
  signature: "sig::did:web:hermes.bot"
};

// Open tool — no identity:
describe_service()

// Identified flow:
subscribe({ ...id, categories: ["compute"] })
search_products({ ...id, category: "compute" })
add_to_cart({ ...id, sku, qty: 1 })
checkout({ ...id, cartId })
confirm_purchase({ ...id, orderId })`}</pre>
            </div>
          </div>

          <p className="marketing-test-note">
            Watch scored requests appear in real time on the{" "}
            <Link href="/dashboard">operations console</Link>. Full tool catalog
            and spec: <Link href="/a2a">A2A Spec</Link>.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="marketing-cta">
        <div className="marketing-container marketing-cta-inner">
          <h2 className="marketing-cta-title">Ready to see it live?</h2>
          <p className="marketing-cta-lead">
            Open the industrial control console — operations feed, agent CRM,
            catalog, campaigns, and governance on one dashboard.
          </p>
          <Link
            href="/dashboard"
            className="marketing-btn marketing-btn-primary marketing-btn-lg"
          >
            Open Operations Console →
          </Link>
        </div>
      </section>
    </>
  );
}
