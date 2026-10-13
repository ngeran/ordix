"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText, UserRound, X } from "lucide-react";
import { api, showErrorToast } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "@/stores/toast-store";
import type { Category } from "@/db/schema";
import type { OrderDetail, ProductWithCategory } from "@/types";
import { cn } from "@/lib/utils";
import { ProductGrid } from "@/components/pos/product-grid";
import { CartPanel } from "@/components/pos/cart-panel";
import { CustomerPicker } from "@/components/pos/customer-picker";
import { Button } from "@/components/ui/button";
import { LoadingArea } from "@/components/ui/spinner";

// ============================================================
// SECTION: POS screen — the order-taking terminal
// ------------------------------------------------------------
//   1. customer banner (step 1, mandatory)
//   2. tap "+ Add to Tray" on a part card → one box lands in
//      the ORDER TRAY
//   3. in the tray: type or step the κουτιά / τεμάχια numbers
//   4. giant green confirm → straight to production
// Catalog on the left, tray on the right (desktop); the tray
// becomes a drawer on tablets and phones.
// ============================================================

export function PosScreen() {
  const t = useT();
  const router = useRouter();

  // -- Server data: the whole active catalog (filtered client-side) --
  const { data: products, isStale } = usePolling<ProductWithCategory[]>(
    "/api/products?active=true",
    { intervalMs: 15_000 }
  );
  const { data: categories } = usePolling<Category[]>("/api/categories", {
    intervalMs: 60_000,
  });

  // -- Ticket state --
  const customer = useCartStore((state) => state.customer);
  const items = useCartStore((state) => state.items);
  const addProduct = useCartStore((state) => state.addProduct);
  const appendOrderId = useCartStore((state) => state.appendOrderId);
  const appendOrderLabel = useCartStore((state) => state.appendOrderLabel);
  const stopAppend = useCartStore((state) => state.stopAppend);
  const clearCart = useCartStore((state) => state.clearCart);

  const lineCount = items.length;

  // -- UI state --
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [placing, setPlacing] = useState(false);

  // ============================================================
  // SECTION: Add to tray (one box per tap; adjust in the tray)
  // ============================================================

  const addToTray = (product: ProductWithCategory) => {
    addProduct({
      productId: product.id,
      partNumber: product.partNumber,
      name: product.name,
      piecesPerBox: Math.max(1, product.itemsPerBox ?? 1),
      imageUrl: product.imageUrl,
    });
  };

  // ============================================================
  // SECTION: Place order / append round
  // ============================================================

  const submitTicket = async () => {
    // 0/0 lines are drafts — never submitted.
    const placeable = items.filter(
      (item) => item.quantityBoxes > 0 || item.quantityItems > 0
    );
    if (placeable.length === 0 || placing) return;

    if (!appendOrderId && !customer) {
      toast.warning(t("customer.required"));
      setCustomerPickerOpen(true);
      return;
    }

    setPlacing(true);
    try {
      const payload = {
        notes: useCartStore.getState().notes ?? undefined,
        items: placeable.map((item) => ({
          productId: item.productId,
          quantityBoxes: item.quantityBoxes,
          quantityItems: item.quantityItems,
          note: item.note ?? undefined,
        })),
      };

      if (appendOrderId) {
        const updated = await api.post<OrderDetail>(
          `/api/orders/${appendOrderId}/items`,
          { items: payload.items }
        );
        toast.success(t("pos.roundAdded", { number: updated.orderNumber }));
        clearCart();
        router.push(`/orders/${appendOrderId}`);
      } else {
        const created = await api.post<OrderDetail>("/api/orders", {
          ...payload,
          customerId: customer!.id,
        });
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
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* -- Customer banner: step 1 of the flow -- */}
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
        >
          <UserRound className="h-5 w-5" />
        </span>
        {customer ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{customer.name}</p>
              <p className="-mt-0.5 text-xs text-on-surface-muted">
                {t("customer.select")}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCustomerPickerOpen(true)}
            >
              {t("customer.change")}
            </Button>
          </>
        ) : (
          <>
            <p className="flex-1 font-medium text-on-surface-muted">
              {t("customer.noneSelected")}
            </p>
            <Button onClick={() => setCustomerPickerOpen(true)}>
              <UserRound className="h-5 w-5" />
              {t("customer.select")}
            </Button>
          </>
        )}
      </div>

      {/* -- Append-round banner -- */}
      {appendOrderId && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-primary-soft px-4 py-2 text-sm">
          <span className="font-medium text-primary">
            {t("pos.appendBanner", { number: appendOrderLabel ?? "" })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              stopAppend();
              setDrawerOpen(false);
            }}
          >
            <X className="h-4 w-4" />
            {t("pos.stopAppend")}
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* -- Left: catalog ledger -- */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Products">
          <ProductGrid
            products={products}
            categories={categories ?? []}
            isStale={isStale}
            onAdd={addToTray}
          />
        </section>

        {/* -- Right: order tray (xl+) -- */}
        <aside className="hidden w-96 shrink-0 flex-col border-l border-border p-4 xl:flex">
          <CartPanel placing={placing} onSubmit={submitTicket} />
        </aside>
      </div>

      {/* -- Mobile/tablet: floating tray bar → drawer -- */}
      <button
        onClick={() => setDrawerOpen(true)}
        disabled={lineCount === 0 && !appendOrderId}
        className={cn(
          "fixed bottom-20 right-4 z-30 flex items-center gap-3 rounded-2xl bg-primary px-6 py-5 text-lg font-bold text-on-primary shadow-pop transition-opacity lg:bottom-6 xl:hidden",
          lineCount === 0 && !appendOrderId && "pointer-events-none opacity-0"
        )}
        aria-label={`${lineCount} ${t("common.items")}`}
      >
        <ReceiptText className="h-6 w-6" />
        <span>{lineCount}</span>
      </button>

      {/* Tray drawer (below xl) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50 xl:hidden">
          <div className="scrollbar-thin flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto bg-surface p-3 shadow-pop">
            <CartPanel
              placing={placing}
              onSubmit={submitTicket}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Customer picker (step 1) */}
      <CustomerPicker
        open={customerPickerOpen}
        onClose={() => setCustomerPickerOpen(false)}
      />

      {/* First-load spinner (catalog) */}
      {!products && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
          <LoadingArea label={t("common.loading")} />
        </div>
      )}
    </div>
  );
}
