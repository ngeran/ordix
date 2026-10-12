// ============================================================
// SECTION: Admin customers (route)
// ============================================================

import { CustomersAdminScreen } from "@/components/admin/customers-admin-screen";

export const metadata = { title: "Customers" };

export default function AdminCustomersPage() {
  return <CustomersAdminScreen />;
}
