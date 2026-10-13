// ============================================================
// SECTION: Next.js configuration
// ------------------------------------------------------------
// `initOpenNextCloudflareForDev()` wires the Cloudflare platform
// (D1, KV, …) into `next dev` through wrangler's local miniflare
// proxy, so `getCloudflareContext()` works in development exactly
// like it does on the deployed Worker.
// ============================================================

import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Don't advertise the framework in response headers.
  poweredByHeader: false,

  // Security headers — frame-ancestors 'none' plus the basics;
  // CSP is intentionally left loose (Next inline scripts) and can
  // be tightened with nonce-based middleware later if needed.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  // Product images may live on arbitrary remote hosts (or be data URLs);
  // skip the Next image optimizer so no loader config is needed on Workers.
  images: { unoptimized: true },
};

// Enable local Cloudflare bindings (D1 "DB") during `next dev`.
initOpenNextCloudflareForDev();

export default nextConfig;
