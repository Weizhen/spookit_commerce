# AGENTS.md

## Cursor Cloud specific instructions

Spookit Commerce is a **single Next.js 15 app** (App Router, React 19, TypeScript,
npm). One process serves the marketing site (`/`), the public ops console
(`/dashboard`, `/catalog`, `/crm`, `/campaigns`, `/governance`, `/a2a`), the A2A
**MCP** endpoint (`/api/mcp`), and discovery (`/.well-known/agent-card.json`).
Standard scripts (`dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:*`)
live in `package.json`; see `README.md` for the product/setup overview.

Lint, typecheck and unit tests need **no database** and run as-is:
`npm run lint`, `npm run typecheck`, `npm test`.

### Database — local Neon-HTTP proxy (the only non-obvious part)

The app's sole store is Postgres, reached through Neon's **HTTP serverless
driver** (`@neondatabase/serverless` + `drizzle-orm/neon-http`) — not a raw
Postgres socket. There is no real Neon in the VM, so a **local Postgres + a
Neon-HTTP-emulating proxy** stand in. The proxy lives outside the repo in
`~/neon-proxy/` (persisted in the VM snapshot):

- `proxy.cjs` — speaks Neon's HTTP `/sql` protocol, backed by local Postgres.
  Listens on `https://api.local:443/sql` (the endpoint the driver derives from a
  `db.local` connection host). Needs `sudo` for port 443.
- `cert.pem` / `key.pem` — self-signed TLS cert for `api.local` / `db.local`.
- `start-db.sh` — idempotent: starts Postgres + proxy (regenerates cert / installs
  `pg` if missing). `init-schema.sh <repo>` — creates the `commerce`/`catalog`
  schemas + tables via `drizzle-kit generate` → `psql`.

`/workspace/.env` (gitignored) points the driver at the proxy:
```
DATABASE_URL=postgresql://postgres:postgres@db.local:5432/main   # -> https://api.local/sql
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/main
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Each session, start the DB stack** (not auto-started; proxy needs sudo/port 443):
```
bash ~/neon-proxy/start-db.sh
```
On a fresh DB (no schemas/data), run once:
```
bash ~/neon-proxy/init-schema.sh /workspace
NODE_EXTRA_CA_CERTS=$HOME/neon-proxy/cert.pem npm run db:seed
```

**Run the app / seed / build with `NODE_EXTRA_CA_CERTS`** so Node's fetch trusts
the proxy's self-signed cert — without it every query fails with
`Error connecting to database`:
```
NODE_EXTRA_CA_CERTS=$HOME/neon-proxy/cert.pem npm run dev   # http://localhost:3000
```

### Gotchas

- **`npm run db:push` / `db:migrate` / `db:studio` do NOT work here.** drizzle-kit
  uses Neon's *websocket* driver (`wss://127.0.0.1/v2`), which the HTTP proxy
  doesn't speak. Use `~/neon-proxy/init-schema.sh` (db:generate → psql) instead.
- **Don't run `npm run build` while `npm run dev` is running** — `next build`
  overwrites `.next` and breaks the live dev server. After a build, restart dev
  with `rm -rf .next && NODE_EXTRA_CA_CERTS=$HOME/neon-proxy/cert.pem npm run dev`.
- If **real Neon credentials** are ever provided (e.g. `DATABASE_URL` / `DIRECT_URL`
  secrets), the local Postgres + proxy are unnecessary: set them in `.env` and
  drop `NODE_EXTRA_CA_CERTS` + `start-db.sh`.

### End-to-end smoke test (A2A purchase)

The bundled buyer agent runs the full search → cart → checkout → confirm flow
against the local MCP endpoint (seeded identity `did:web:hermes.bot`); each run
adds rows to the dashboard's metrics + Live A2A Activity Feed:
```
node Skill/scripts/buy.mjs --endpoint http://localhost:3000/api/mcp --category compute --qty 1 --confirm
```
