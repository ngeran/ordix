// ============================================================
// SECTION: Imports
// ============================================================

import { drizzle } from "drizzle-orm/d1";
import type { BatchItem } from "drizzle-orm/batch";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

// ============================================================
// SECTION: Database client factory
// ------------------------------------------------------------
// The D1 binding ("DB" in wrangler.jsonc) is resolved through
// the OpenNext Cloudflare context:
//   - production: the real Worker binding
//   - development: the local miniflare proxy started by
//     `initOpenNextCloudflareForDev()` in next.config.ts
// `async: true` works in every runtime (route handlers, server
// components, middleware), so it is used unconditionally.
// ============================================================

/** Shared Drizzle database handle factory. Call per-request. */
export async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return drizzle(env.DB, { schema });
}

/**
 * Cloudflare D1 rejects statements with more than 100 bound parameters (local
 * dev does NOT enforce this). Runs `run` over slices of `values` and joins the
 * results — use for every `inArray(...)` whose list can grow.
 */
export async function queryInChunks<T, R>(
  values: T[],
  run: (chunk: T[]) => Promise<R[]>,
  size = 90
): Promise<R[]> {
  const chunks: T[][] = [];
  for (let start = 0; start < values.length; start += size) {
    chunks.push(values.slice(start, start + size));
  }
  return (await Promise.all(chunks.map(run))).flat();
}

/** Raw D1 binding — for schema-agnostic work (backup/restore). */
export async function getD1(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

// `getDb` is intentionally async-shaped even though it performs no
// awaits of its own beyond the context resolution — keeping the
// call sites `await getDb()` makes swapping in a pooled client
// (e.g. for local SQLite tests) a non-breaking change.

// ============================================================
// SECTION: Batch helper
// ------------------------------------------------------------
// D1 batches are all-or-nothing transactions. Drizzle types them
// as a non-empty tuple; building statements dynamically yields a
// plain array, so this helper converts with a real emptiness
// check instead of scattered `as never` casts.
// ============================================================

export function asBatch(
  statements: BatchItem<"sqlite">[]
): [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] {
  if (statements.length === 0) {
    throw new Error("db.batch requires at least one statement");
  }
  return statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
}
