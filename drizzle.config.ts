// ============================================================
// SECTION: Drizzle Kit configuration
// ------------------------------------------------------------
// SQL migrations are generated into ./drizzle and applied to D1
// with wrangler (local or remote). No live connection string is
// needed because we only generate SQL here.
// ============================================================

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
