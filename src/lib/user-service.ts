// ============================================================
// SECTION: Imports
// ============================================================

import { compareSync } from "bcryptjs";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { users, type User } from "@/db/schema";

// ============================================================
// SECTION: User read model + safety rules
// ------------------------------------------------------------
// The password hash never leaves the server; the legacy/hidden
// email placeholder (<username>@users.invalid) is not exposed.
// ============================================================

type Database = Awaited<ReturnType<typeof getDb>>;

export type PublicUser = Pick<User, "id" | "username" | "name" | "role" | "isActive" | "createdAt">;

export const publicUserColumns = {
  id: users.id,
  username: users.username,
  name: users.name,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

/** Re-confirms a signed-in user's password before destructive actions. */
export async function checkPassword(db: Database, userId: string, password: string): Promise<boolean> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row !== undefined && compareSync(password, row.passwordHash);
}

/** Placeholder for the NOT NULL UNIQUE legacy email column. */
export const placeholderEmail = (username: string) => `${username}@users.invalid`;

/** Active admins other than `excludeId` — guards "last admin" edits. */
export async function countOtherActiveAdmins(db: Database, excludeId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(
      and(inArray(users.role, ["admin", "owner"]), eq(users.isActive, true), ne(users.id, excludeId))
    );
  return Number(row?.count ?? 0);
}
