// ============================================================
// SECTION: Imports
// ============================================================

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ValidationError } from "@/lib/validation";
import type { OrdixSessionUser } from "@/types";

// ============================================================
// SECTION: API auth guards
// ------------------------------------------------------------
// Every API route starts with one of these helpers, keeping the
// "who may call this" logic in exactly one place:
//   requireUser()  → any authenticated staff/admin
//   requireAdmin() → admin role only (catalog, stock, settings)
// ============================================================

/** Returns the session user, or null when unauthenticated. */
export async function getSessionUser(): Promise<OrdixSessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return session.user as OrdixSessionUser;
}

/** Guard result: either an authenticated user or a 401/403 response. */
export type AuthGuard =
  | { ok: true; user: OrdixSessionUser }
  | { ok: false; response: NextResponse };

/** Any signed-in user (staff or admin). */
export async function requireUser(): Promise<AuthGuard> {
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, user };
}

/** Admin-only operations: catalog, stock, settings, category CRUD. */
export async function requireAdmin(): Promise<AuthGuard> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  if (guard.user.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return guard;
}

// ============================================================
// SECTION: Error → response mapping
// ------------------------------------------------------------
// Route handlers wrap their body in try/catch and delegate here,
// so every failure mode maps to the same JSON envelope:
//   ValidationError          → 400 (first issue message)
//   UNIQUE constraint (D1)   → 409 (duplicate key, e.g. partNumber)
//   anything else            → 500 (logged server-side)
// ============================================================

/** Detects SQLite unique-index violations bubbling up from D1. */
function isUniqueConstraintError(error: unknown): boolean {
  const err = error as {
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  return [err.code, err.message, err.cause?.code, err.cause?.message].some(
    (text) => text !== undefined && text.includes("UNIQUE")
  );
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: error.issues[0] ?? "Invalid input" },
      { status: 400 }
    );
  }
  if (isUniqueConstraintError(error)) {
    return NextResponse.json(
      { error: "This value already exists (duplicate)" },
      { status: 409 }
    );
  }
  console.error("[api] unhandled error:", error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
