// ============================================================
// SECTION: Ambient type declarations
// ------------------------------------------------------------
// `CloudflareEnv` describes the bindings available on the
// Worker (and through getCloudflareContext() in dev). The
// interface is declared empty by @opennextjs/cloudflare and
// merges with this declaration.
// ============================================================

/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  /** Ordix primary database (Cloudflare D1). */
  DB: D1Database;
}
