/**
 * Drizzle client over Neon's serverless driver.
 *
 * A single pooled connection serves both Postgres schemas (`commerce` +
 * `catalog`); Drizzle targets each schema via the table definitions. MCP runs
 * stateless, so there is no session store here — only the DB connection.
 *
 * Initialization is lazy: importing this module never throws, so pages can
 * catch a missing/invalid `DATABASE_URL` at query time and render a helpful
 * "database not connected" notice instead of crashing the render.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as commerceSchema from "./commerce/schema";
import * as catalogSchema from "./catalog/schema";

export const schema = { ...commerceSchema, ...catalogSchema };

type DrizzleClient = ReturnType<typeof createDb>;

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and add your Neon pooled connection string.",
    );
  }
  const sql = neon(connectionString);
  return drizzle({ client: sql, schema, casing: "snake_case" });
}

let _db: DrizzleClient | null = null;

function getDb(): DrizzleClient {
  if (!_db) _db = createDb();
  return _db;
}

// Lazy proxy: the real client is created on first property access.
export const db = new Proxy({} as DrizzleClient, {
  get(_target, prop, receiver) {
    const client = getDb();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type DB = DrizzleClient;
