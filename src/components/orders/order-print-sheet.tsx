"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import type { OrderItem } from "@/db/schema";
import type { OrderDetail } from "@/types";
import { api } from "@/lib/api-client";
import { useLocale, useT } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";
import { businessName } from "@/lib/settings";
import { useAppSettings } from "@/stores/settings-store";
import { Button } from "@/components/ui/button";
import { LoadingArea } from "@/components/ui/spinner";
import { BrandMark } from "@/components/layout/app-shell";
import { quantityLabel } from "@/components/orders/item-labels";

// ============================================================
// SECTION: Order sheet (print / PDF)
// ------------------------------------------------------------
// A picking / delivery slip: business, order number + date,
// customer name, address and phone, then every active line with
// its code and quantity. Deliberately price-free.
//
// "Print" and "Save as PDF" both open the browser's print dialog,
// which offers Save-as-PDF on every platform (incl. iPad/iPhone)
// and renders Greek with the app's own font. A generated PDF would
// need a PDF library + an embedded Greek font (~0.5 MB) for the
// same result. document.title is set so the PDF file is named
// after the order.
//
// The paper is styled in fixed light colors (not theme tokens):
// it prints black-on-white even when the app runs in dark mode.
// Print rules live in globals.css (@media print).
// ============================================================

/** Pieces for a line; legacy rows only recorded a plain count. */
function lineQuantity(item: OrderItem, t: Parameters<typeof quantityLabel>[1]): string {
  if (item.quantityBoxes === 0 && item.quantityItems === 0 && item.quantity > 0) {
    return `${item.quantity} ${item.quantity === 1 ? t("pos.item") : t("pos.items")}`;
  }
  return quantityLabel(item, t);
}

export function OrderPrintSheet({ orderId }: { orderId: string }) {
  const t = useT();
  const locale = useLocale();
  const settings = useAppSettings();
  const [order, setOrder] = useState<OrderDetail | null | undefined>(undefined);
  const [showPdfHint, setShowPdfHint] = useState(false);
  const [printedAt] = useState(() => new Date());

  useEffect(() => {
    api
      .get<OrderDetail>(`/api/orders/${orderId}`)
      .then(setOrder)
      .catch(() => setOrder(null));
  }, [orderId]);

  // PDF file name = page title in every browser's Save-as-PDF.
  // Also re-applied at print time: Next.js may set the route's
  // metadata title after this effect (seen in Safari).
  useEffect(() => {
    if (!order) return;
    const previous = document.title;
    const title = [order.orderNumber, order.customerName].filter(Boolean).join(" — ");
    const apply = () => {
      document.title = title;
    };
    apply();
    const late = setTimeout(apply, 500);
    window.addEventListener("beforeprint", apply);
    return () => {
      clearTimeout(late);
      window.removeEventListener("beforeprint", apply);
      document.title = previous;
    };
  }, [order]);

  if (order === undefined) return <LoadingArea label={t("common.loading")} />;
  if (order === null) {
    return <p className="p-8 text-center text-on-surface-muted">{t("print.notFound")}</p>;
  }

  const items = order.items.filter((item) => item.status === "active");
  const brand = businessName(settings);

  return (
    <div className="print-root h-app overflow-y-auto bg-surface-container-low px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      {/* ============================================================
          SECTION: Toolbar (screen only)
          ============================================================ */}
      <div className="no-print mx-auto mb-4 flex max-w-[52rem] flex-wrap items-center gap-2">
        <Link href={`/orders/${order.id}`}>
          <Button variant="ghost">
            <ArrowLeft className="h-5 w-5" />
            {t("common.back")}
          </Button>
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowPdfHint(true);
              window.print();
            }}
          >
            <FileDown className="h-5 w-5" />
            {t("print.pdf")}
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-5 w-5" />
            {t("print.print")}
          </Button>
        </div>
        {showPdfHint && (
          <p className="basis-full text-right text-sm text-on-surface-muted">{t("print.pdfHint")}</p>
        )}
      </div>

      {/* ============================================================
          SECTION: The paper (A4)
          ============================================================ */}
      <article className="print-paper mx-auto max-w-[52rem] rounded-xl bg-white p-6 text-[15px] leading-snug text-neutral-900 shadow-pop sm:p-10">
        {/* -- Letterhead -- */}
        <header className="flex items-start justify-between gap-4 border-b-2 border-neutral-900 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark name={brand} logoUrl={settings.business.logoUrl} className="h-12 w-12 print:shadow-none" />
            <div className="min-w-0">
              <p className="text-xl font-bold [overflow-wrap:anywhere]">{brand}</p>
              <p className="text-sm uppercase tracking-wider text-neutral-600">{t("print.title")}</p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs uppercase tracking-wider text-neutral-600">{t("print.orderNo")}</p>
            <p className="font-mono text-2xl font-bold">{order.orderNumber}</p>
            <p className="mt-1 text-sm text-neutral-700">
              {t("print.date")}: {formatDateTime(order.placedAt, locale)}
            </p>
          </div>
        </header>

        {/* -- Customer -- */}
        <section className="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-neutral-600">{t("print.customer")}</p>
            <p className="text-2xl font-bold [overflow-wrap:anywhere]">{order.customerName ?? "—"}</p>
            {order.customer?.address && (
              <p className="mt-1 [overflow-wrap:anywhere]">
                <span className="text-neutral-600">{t("print.address")}: </span>
                {order.customer.address}
              </p>
            )}
          </div>
          {order.customer?.phone && (
            <div className="sm:text-right">
              <p className="text-xs uppercase tracking-wider text-neutral-600">{t("print.phone")}</p>
              <p className="font-mono text-lg font-semibold">{order.customer.phone}</p>
            </div>
          )}
        </section>

        {/* -- Lines -- */}
        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-neutral-900 text-left text-xs uppercase tracking-wider text-neutral-600">
              <th className="w-8 py-2 pr-2 font-semibold">#</th>
              <th className="py-2 pr-3 font-semibold">{t("print.code")}</th>
              <th className="py-2 pr-3 font-semibold">{t("print.item")}</th>
              <th className="py-2 text-right font-semibold">{t("print.qty")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id} className="break-inside-avoid border-b border-neutral-300 align-top">
                <td className="py-2.5 pr-2 font-mono text-neutral-500">{index + 1}</td>
                <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-sm">{item.partNumber}</td>
                <td className="py-2.5 pr-3">
                  <span className="font-semibold [overflow-wrap:anywhere]">{item.name}</span>
                  {item.note && <span className="block text-sm italic text-neutral-600">{item.note}</span>}
                </td>
                <td className="whitespace-nowrap py-2.5 text-right text-base font-bold">{lineQuantity(item, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-right text-sm text-neutral-600">{items.length === 1 ? t("print.lineOne") : t("print.lines", { count: items.length })}</p>

        {/* -- Order notes -- */}
        {order.notes && (
          <section className="mt-5 break-inside-avoid rounded-lg border border-neutral-400 p-3">
            <p className="text-xs uppercase tracking-wider text-neutral-600">{t("print.notes")}</p>
            <p className="whitespace-pre-wrap">{order.notes}</p>
          </section>
        )}

        {/* -- Hand-over signature + footer -- */}
        <footer className="mt-10 flex break-inside-avoid flex-wrap items-end justify-between gap-6 text-sm text-neutral-600">
          <div className="w-64 max-w-full">
            <div className="h-10 border-b border-neutral-500" />
            <p className="mt-1">{t("print.receivedBy")}</p>
          </div>
          <p>{t("print.printedAt", { time: formatDateTime(printedAt, locale) })}</p>
        </footer>
      </article>
    </div>
  );
}
