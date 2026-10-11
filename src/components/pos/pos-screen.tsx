"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText, X } from "lucide-react";
import { api, showErrorToast } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "@/stores/toast-store";
import type { Category } from "@/db/schema";
import type { OrdixSettingsDTO, OrderDetail, ProductWithCategory } from "@/types";
import { cn, formatMoney } from "@/lib/utils";
import { useLocale } from "@/lib/i18n";
import { ProductGrid } from "@/components/pos/product-grid";
import { CartPanel } from "@/components/pos/cart-panel";
import { Button } from "@/components/ui/button";
import { LoadingArea } from "@/components/ui/spinner";

// ============================================================
// SECTION: POS screen — product grid + draft ticket
// ------------------------------------------------------------
// Orchestration only; rendering lives in ProductGrid/CartPanel.
//
// Data flow:
//   - catalog + categories poll (15 s / 60 s) so stock badges
//     stay honest without manual refresh
//   - the ticket itself lives in Zustand and survives reloads
//   - placing = POST /api/orders (stock deducted server-side);
//     appending = POST /api/orders/[id]/items when the ticket is
//     in "append round" mode (entered from an order's detail page)
// ============================================================

export function PosScreen() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();

  // -- Server data --
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const { data: categories } = usePolling<Category[]>("/api/categories", {
    intervalMs: 60_000,
  });
  const catalogUrl = useMemo(() => {
    const params = new URLSearchParams({ active: "true" });
    if (search.trim()) params.set("q", search.trim());
    if (selectedCategoryId) params.set("categoryId", selectedCategoryId);
    return `/api/products?${params.toString()}`;
  }, [search, selectedCategoryId]);
  const { data: products, isStale } = usePolling<ProductWithCategory[]>(catalogUrl, {
    intervalMs: 15_000,
  });
  const { data: settings } = usePolling<OrdixSettingsDTO>("/api/settings", {
    intervalMs: 120_000,
  });

  // -- Ticket state --
  const items = useCartStore((state) => state.items);
  const appendOrderId = useCartStore((state) => state.appendOrderId);
  const appendOrderLabel = useCartStore((state) => state.appendOrderLabel);
  const stopAppend = useCartStore((state) => state.stopAppend);
  const clearCart = useCartStore((state) => state.clearCart);
  const lineCount = useCartStore((state) => state.items.length);
  const totalCents = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)
  );

  // -- UI state --
  const [cartOpen, setCartOpen] = useState(false); // mobile ticket drawer
  const [placing, setPlacing] = useState(false);

  const allowOversell = settings?.allowOversell ?? false;

  // ============================================================
  // SECTION: Place order / append round
  // ============================================================

  const submitTicket = async () => {
    if (items.length === 0 || placing) return;
    setPlacing(true);
    try {
      const payload = {
        customerName: useCartStore.getState().customerName ?? undefined,
        notes: useCartStore.getState().notes ?? undefined,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          note: item.note ?? undefined,
        })),
      };

      if (appendOrderId) {
        // Append mode: new round on a live order.
        const updated = await api.post<OrderDetail>(
          `/api/orders/${appendOrderId}/items`,
          { items: payload.items }
        );
        toast.success(t("pos.roundAdded", { number: updated.orderNumber }));
        clearCart();
        router.push(`/orders/${appendOrderId}`);
      } else {
        // Fresh order: stock is deducted atomically server-side.
        const created = await api.post<OrderDetail>("/api/orders", payload);
        toast.success(t("pos.orderPlaced", { number: created.orderNumber }));
        clearCart();
        router.push(`/orders/${created.id}`);
      }
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setPlacing(false);
    }
  };

  // ============================================================
  // SECTION: Render
  // ============================================================

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-[calc(100dvh-3.5rem)]">
      {/* -- Append-round banner -- */}
      {appendOrderId && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-primary-soft px-4 py-2 text-sm">
          <span className="font-medium text-primary">
            {t("pos.appendBanner", { number: appendOrderLabel ?? "" })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => { stopAppend(); setCartOpen(false); }}>
            <X className="h-4 w-4" />
            {t("pos.stopAppend")}
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* -- Left: catalog -- */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Products">
          <ProductGrid
            products={products}
            categories={categories ?? []}
            search={search}
            onSearch={setSearch}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            allowOversell={allowOversell}
            isStale={isStale}
          />
        </section>

        {/* -- Right: ticket (desktop side panel) -- */}
        <aside className="hidden w-96 shrink-0 border-l border-border xl:block">
          <CartPanel
            allowOversell={allowOversell}
            placing={placing}
            onSubmit={submitTicket}
          />
        </aside>
      </div>

      {/* -- Mobile/tablet: floating ticket bar → drawer -- */}
      <button
        onClick={() => setCartOpen(true)}
        disabled={lineCount === 0 && !appendOrderId}
        className={cn(
          "fixed bottom-20 right-4 z-30 flex items-center gap-3 rounded-2xl bg-primary px-6 py-5 text-lg font-bold text-on-primary shadow-pop transition-opacity lg:bottom-6 xl:hidden",
          lineCount === 0 && !appendOrderId && "pointer-events-none opacity-0"
        )}
        aria-label={`${lineCount} ${t("common.items")}`}
      >
        <ReceiptText className="h-6 w-6" />
        <span>{lineCount}</span>
        <span>·</span>
        <span>{formatMoney(totalCents, locale)}</span>
      </button>

      {/* Ticket drawer (below xl) */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50 xl:hidden">
          <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-pop">
            <CartPanel
              allowOversell={allowOversell}
              placing={placing}
              onSubmit={submitTicket}
              onClose={() => setCartOpen(false)}
            />
          </div>
        </div>
      )}

      {/* First-load spinner (catalog) */}
      {!products && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
          <LoadingArea label={t("common.loading")} />
        </div>
      )}
    </div>
  );
}
