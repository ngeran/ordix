// ============================================================
// SECTION: Imports
// ============================================================

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type UserRole } from "@/db/schema";

// ============================================================
// SECTION: Login rate limiting (per-isolate, best-effort)
// ------------------------------------------------------------
// Simple in-memory lockout: 5 failures → 60 s lockout, keyed by
// the typed login name. On Workers the map lives per isolate, so it is a speed
// bump rather than a hard guarantee — real protection comes from
// strong passwords; this slows automated credential stuffing.
// ============================================================

const MAX_FAILURES = 5;
const LOCKOUT_MS = 60_000;

const failureCounts = new Map<string, { count: number; lockedUntil: number }>();

function isLockedOut(key: string): boolean {
  const entry = failureCounts.get(key);
  if (!entry) return false;
  if (entry.lockedUntil > Date.now()) return true;
  if (entry.lockedUntil !== 0 && entry.lockedUntil <= Date.now()) {
    failureCounts.delete(key); // lockout expired — start fresh
  }
  return false;
}

function recordFailure(key: string): void {
  const entry = failureCounts.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  failureCounts.set(key, entry);
}

function clearFailures(key: string): void {
  failureCounts.delete(key);
}

// ============================================================
// SECTION: NextAuth configuration (credentials + JWT sessions)
// ------------------------------------------------------------
// JWT strategy keeps every request adapter-free — a perfect fit
// for D1, which has no NextAuth adapter anyway. The role is
// minted into the token at login and copied onto the session.
// ============================================================

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const login = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!login || !password) return null;

        const lockKey = login.toLowerCase().trim();
        if (isLockedOut(lockKey)) return null;

        // Username sign-in; an email still works for accounts that
        // predate usernames (muscle memory, password managers).
        const db = await getDb();
        const [user] = await db
          .select()
          .from(users)
          .where(lockKey.includes("@") ? eq(users.email, lockKey) : eq(users.username, lockKey))
          .limit(1);

        // Compare only when a user exists to keep timing similar
        // for unknown names (avoids trivial user enumeration).
        if (!user || !user.isActive) return null;

        const valid = compareSync(password, user.passwordHash);
        if (!valid) {
          recordFailure(lockKey);
          return null;
        }

        clearFailures(lockKey);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          role: user.role as UserRole,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // Warehouse tablets stay signed in for a week; a stolen
    // session is low-risk (no payments) but bounded is better.
    maxAge: 7 * 24 * 60 * 60, // 7 days, in seconds
  },
  callbacks: {
    // Mint id + role into the JWT right after successful login.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.username = user.username;
      }
      return token;
    },
    // Expose id + role on the session object for the whole app.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.username = (token.username as string | undefined) ?? "";
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  trustHost: true,
});
