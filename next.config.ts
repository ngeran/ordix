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

  // `next dev` only: tablets on the LAN open the dev server as
  // http://<this-machine's-ip>:3000. Next 16 blocks its dev assets for
  // any origin not listed here, so the page never hydrated (taps did
  // nothing, sign-in looped back to /login). Private ranges only;
  // production builds ignore this setting.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*", "*.local"],

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
// PERSIST_DIR (same as the db scripts) points dev at another local data folder.
initOpenNextCloudflareForDev(
  process.env.PERSIST_DIR ? { persist: { path: `${process.env.PERSIST_DIR}/v3` } } : undefined
);

export default nextConfig;
