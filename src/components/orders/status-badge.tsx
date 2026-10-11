// ============================================================
// SECTION: Status badge (shared)
// ------------------------------------------------------------
// The one renderer for order status everywhere: board cards,
// detail header, prep board. Colors/labels live in
// STATUS_META so server, API and UI stay in sync.
// ============================================================

import type { OrderStatus } from "@/db/schema";
import { STATUS_META } from "@/lib/order-status";
import { useLocale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: OrderStatus }) {
  const locale = useLocale();
  const meta = STATUS_META[status];
  return (
    <Badge className={meta.badgeClass} dot={meta.accentClass}>
      {meta[locale]}
    </Badge>
  );
}
