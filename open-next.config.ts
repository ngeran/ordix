// ============================================================
// SECTION: OpenNext → Cloudflare adapter configuration
// ------------------------------------------------------------
// The default Cloudflare config is all Ordix needs: the Next.js
// server is bundled into a single Worker plus static assets.
// Cache/queue extensions (R2 incremental cache etc.) are added
// later only if profiling shows they pay off.
// ============================================================

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
