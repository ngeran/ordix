// ============================================================
// SECTION: Admin settings (route)
// ============================================================

import { SettingsScreen } from "@/components/admin/settings-screen";
import { requireUser } from "@/lib/api-auth";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  // Role read from the DB (not the JWT) so a CLI promotion shows up without re-login.
  const guard = await requireUser();
  return <SettingsScreen isOwner={guard.ok && guard.user.role === "owner"} />;
}
