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
//   - everything else requires a session; missing → /login with
//     a callbackUrl so users land where they started.
//   - /admin/* additionally requires the admin role.
//   - static PWA assets (manifest, service worker, icons) bypass
//     the guard — browsers fetch them without session cookies.
// ============================================================

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

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

  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin area is role-gated at the edge; staff get bounced to
  // the order screen rather than a 403 wall.
  if (pathname.startsWith("/admin") && req.auth.user.role !== "admin") {
    return NextResponse.redirect(new URL("/order", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons/|manifest.webmanifest|sw.js|apple-touch-icon.png|favicon.ico|offline).*)",
  ],
};
