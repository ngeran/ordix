// ============================================================
// SECTION: NextAuth type augmentation
// ------------------------------------------------------------
// Teaches NextAuth about the custom fields Ordix carries in the
// JWT and session: the internal user id and the role used for
// admin-only route/API guards.
// ============================================================

import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      username: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
    username?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    username?: string;
  }
}
