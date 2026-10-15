// ============================================================
// SECTION: Route protection middleware
// ------------------------------------------------------------
// NOTE: this file is intentionally `middleware.ts`, NOT
// `proxy.ts`. Next 16.2 has a bug where proxy.ts produces an
// empty middleware manifest in production builds
// (vercel/next.js#93328), silently disabling the auth guard.
//
// Behavior:
//   - /login and /api stay public (API routes do their own
//     granular role checks via src/lib/api-auth.ts).
//   - everything else requires a session; missing → /login, and
//     after sign-in everyone starts on /home.
//   - /admin/* additionally requires the admin role.
//   - static PWA assets (manifest, service worker, icons) bypass
//     the guard — browsers fetch them without session cookies.
// ============================================================

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/roles";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public paths: the login page, the auth endpoints themselves
  // (the NextAuth callback MUST pass through), and the health
  // probe. Everything under /api does its own granular role
  // checks via requireUser/requireAdmin — only these two need to
  // be anonymous.
  const publicPaths = ["/login", "/api/auth", "/api/health"];
  if (publicPaths.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Unauthenticated API calls get a machine-readable 401 — a
  // redirect to HTML breaks fetch()-based clients (offline
  // outbox, polling hook treats it as opaque success).
  if (pathname.startsWith("/api/")) {
    if (!req.auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Admin area is role-gated at the edge; staff get bounced to
  // the order screen rather than a 403 wall.
  if (pathname.startsWith("/admin") && !hasAdminAccess(req.auth.user.role)) {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons/|manifest.webmanifest|sw.js|apple-touch-icon.png|favicon.ico|offline).*)",
  ],
};
