# AGENTS.md

## Cursor Cloud specific instructions

Spookit Commerce is a single Next.js 15 app (App Router, React 19, TypeScript, npm).
It serves the marketing site (`/`), a public ops console (`/dashboard`, `/catalog`,
`/crm`, `/campaigns`, `/governance`, `/a2a`), an A2A **MCP** endpoint
(`/api/mcp`), and discovery (`/.well-known/agent-card.json`). Standard scripts
(`dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:*`) are in `package.json`.

Lint/typecheck/test need no database:
- `npm run lint`, `npm run typecheck`, `npm test` (vitest) all run as-is.

### Database (the only non-obvious part)

The app's sole backing store is Postgres, accessed through Neon's **HTTP
serverless driver** (`@neondatabase/serverless` + `drizzle-orm/neon-http`).
There is no real Neon in the VM, so a **local Postgres + a Neon-HTTP-compatible
proxy** stands in. Everything lives under `~/neon-proxy/` (outside the repo):

- `proxy.cjs` — emulates Neon's `/sql` endpoint, backed by local Postgres. It
  listens on `https://api.local:443/sql` (the driver's *default* endpoint for a
  `db.local` host) and `http://127.0.0.1:5433/sql`.
- `cert.pem`/`key.pem` — self-signed TLS cert for `api.local`.
- `start-db.sh` — idempotent: starts Postgres + the proxy (recreates cert/`pg`
  if missing). `init-schema.sh` — creates the `commerce`/`catalog` schemas.

`/workspace/.env` (gitignored) points the driver at the proxy via the default
endpoint:
```
DATABASE_URL=postgresql://postgres:postgres@db.local:5432/main   # -> default endpoint https://api.local/sql
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/main
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Start the DB stack each session** (it is not auto-started; the proxy needs
`sudo` for port 443):
```
bash ~/neon-proxy/start-db.sh
```
If the schema/seed are missing (fresh DB), run once:
```
cd /workspace && bash ~/neon-proxy/init-schema.sh
NODE_EXTRA_CA_CERTS=$HOME/neon-proxy/cert.pem npm run db:seed
```

**Run the app / seed / build with `NODE_EXTRA_CA_CERTS`** so Node's fetch trusts
the proxy's self-signed cert (without it, every query fails with
`Error connecting to database`):
```
NODE_EXTRA_CA_CERTS=$HOME/neon-proxy/cert.pem npm run dev     # http://localhost:3000
```

### Gotchas

- **`npm run db:push` / `db:migrate` / `db:studio` do NOT work here.** drizzle-kit
  uses Neon's *websocket* driver (tries `wss://127.0.0.1/v2`), which the HTTP
  proxy doesn't speak. Use `~/neon-proxy/init-schema.sh` (db:generate → psql)
  instead.
- **Do not run `npm run build` while `npm run dev` is running.** `next build`
  overwrites `.next` and breaks the live dev server (`Cannot find module
  './873.js'`). After a build, restart dev with `rm -rf .next && npm run dev`.
- If real Neon credentials are ever provided (e.g. `DATABASE_URL`/`DIRECT_URL`
  secrets), the local Postgres + proxy are unnecessary: set them in `.env` and
  skip `NODE_EXTRA_CA_CERTS` and `start-db.sh`.

### Exercising the A2A surface (end-to-end smoke test)

The bundled buyer agent runs the full search → cart → checkout → confirm flow
against the local MCP endpoint (seeded identity `did:web:hermes.bot`):
```
node Skill/scripts/buy.mjs --endpoint http://localhost:3000/api/mcp --category compute --qty 1 --confirm
```
