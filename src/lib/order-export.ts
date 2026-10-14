// ============================================================
// SECTION: Imports
// ============================================================

import { xmlDocument, type XmlNode } from "@/lib/xml";

// ============================================================
// SECTION: Completed-orders export shape
// ------------------------------------------------------------
// What accounting / an external system receives. Amounts are
// decimal euros (12.5 → "12.50" in XML); timestamps are ISO 8601
// UTC; `businessDate` is the day the order was placed (Athens).
// Voided lines are left out — the export mirrors what was paid.
// ============================================================

export interface ExportedOrderLine {
  partNumber: string;
  name: string;
  boxes: number;
  pieces: number;
  lineTotal: number;
  note: string | null;
}

export interface ExportedOrder {
  orderNumber: string;
  businessDate: string;
  placedAt: string;
  completedAt: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentNote: string | null;
  total: number;
  currency: "EUR";
  notes: string | null;
  createdBy: string | null;
  closedBy: string | null;
  customer: {
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  items: ExportedOrderLine[];
}

export interface OrdersExport {
  /** Settings → Business → name (falls back to "Ordix"). */
  business: string;
  exportedAt: string;
  from: string;
  to: string;
  count: number;
  orders: ExportedOrder[];
}

export const centsToAmount = (cents: number) => Math.round(cents) / 100;

// ============================================================
// SECTION: Serializers
// ============================================================

export function ordersExportJson(data: OrdersExport): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function ordersExportXml(data: OrdersExport): string {
  const money = (amount: number) => amount.toFixed(2);
  return xmlDocument("ordix", {
    business: data.business,
    exportedAt: data.exportedAt,
    from: data.from,
    to: data.to,
    count: data.count,
    orders: {
      order: data.orders.map(
        (order): XmlNode => ({
          ...order,
          total: money(order.total),
          customer: order.customer,
          items: {
            item: order.items.map((line) => ({ ...line, lineTotal: money(line.lineTotal) })),
          },
        })
      ),
    },
  });
}
