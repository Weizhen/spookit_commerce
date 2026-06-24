import { defineConfig } from "drizzle-kit";

// One Neon project, two Postgres schemas (`commerce` + `catalog`).
// Migrations use the DIRECT (unpooled) URL; the app runtime uses the pooled one.
export default defineConfig({
  dialect: "postgresql",
  schema: ["./db/commerce/schema.ts", "./db/catalog/schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
  // Both custom schemas are managed by drizzle so it won't touch `public`.
  schemaFilter: ["commerce", "catalog"],
  verbose: true,
  strict: true,
});
