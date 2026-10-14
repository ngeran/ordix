// ============================================================
// SECTION: Admin users (route)
// ============================================================

import { UsersScreen } from "@/components/admin/users-screen";

export const metadata = { title: "Users" };

export default function AdminUsersPage() {
  return <UsersScreen />;
}
