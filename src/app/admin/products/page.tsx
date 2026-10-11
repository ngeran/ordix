// ============================================================
// SECTION: Admin products (route)
// ============================================================

import { ProductsScreen } from "@/components/admin/products-screen";

export const metadata = { title: "Products" };

export default function AdminProductsPage() {
  return <ProductsScreen />;
}
