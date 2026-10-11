// ============================================================
// SECTION: NextAuth route handler
// ------------------------------------------------------------
// Mounts the shared auth config (src/lib/auth.ts) on the
// catch-all /api/auth/* endpoint: sign-in, sign-out and session.
// ============================================================

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
