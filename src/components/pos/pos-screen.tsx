"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, ReceiptText, UserRound, X } from "lucide-react";
import { api, showErrorToast } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { uuid } from "@/lib/uuid";
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
// SECTION: Order entry screen
// ------------------------------------------------------------
// A guided 1-2-3 along the top, always visible:
//   1. Customer  — big button until one is chosen
//   2. Products  — tap a card (or scan a code) → lands in tray
//   3. Send      — giant green button in the tray
// Catalog left, tray right from tablet width up; on phones the
// tray is a full-screen sheet opened from a sticky bottom bar.
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

  const filled = items.filter((item) => item.quantityBoxes > 0 || item.quantityItems > 0);
  const totalPcs = filled.reduce(
    (sum, item) => sum + item.quantityBoxes * Math.max(1, item.piecesPerBox) + item.quantityItems,
    0
  );

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

  // Synchronous double-submit lock. `placing` state is read from the
  // render's closure, so two rapid taps can both pass an `if (placing)`
  // guard before React re-renders; a ref is set and read in the same
  // tick and cannot race.
  const submittingRef = useRef(false);

  const submitTicket = async () => {
    // 0/0 lines are drafts — never submitted.
    if (filled.length === 0 || submittingRef.current) return;

    if (!appendOrderId && !customer) {
      toast.warning(t("customer.required"));
      setCustomerPickerOpen(true);
      return;
    }

    submittingRef.current = true;
    setPlacing(true);
    try {
      // Minted HERE, before the first byte leaves: the same id rides
      // the request, any retry and an offline-outbox replay — the
      // server collapses all of them into ONE order.
      const orderId = uuid();
      const payload = {
        notes: useCartStore.getState().notes ?? undefined,
        // One client-minted id per line: on the create path the order
        // id already guards replays (line ids are ignored there); on
        // the append path they make an outbox replay a no-op.
        items: filled.map((item) => ({
          id: uuid(),
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
          id: orderId,
          customerId: customer!.id,
        });
        toast.success(t("pos.orderPlaced", { number: created.orderNumber }));
        clearCart();
        router.push(`/orders/${created.id}`);
      }
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      submittingRef.current = false;
      setPlacing(false);
    }
  };

  // ============================================================
  // SECTION: Render
  // ============================================================

  const customerDone = Boolean(appendOrderId || customer);
  const productsDone = filled.length > 0;

  return (
    <div className="relative flex h-full flex-col">
      {/* ============================================================
          SECTION: Step bar — 1 Customer · 2 Products · 3 Send
          ============================================================ */}
      <div className="shrink-0 border-b border-border bg-surface px-3 py-2.5 sm:px-4 short:py-1">
        {appendOrderId ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-primary-soft px-4 py-2.5 short:min-h-11 short:py-1">
            <span className="font-semibold text-primary">
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
        ) : (
          <div className="flex items-stretch gap-2">
            {/* Step 1 — the customer, as one big button */}
            <button
              type="button"
              onClick={() => setCustomerPickerOpen(true)}
              className={cn(
                "flex min-h-14 short:min-h-11 min-w-0 flex-1 items-center gap-3 rounded-2xl border-2 px-3 text-left transition-colors md:max-w-md",
                customer
                  ? "border-border bg-surface-container-low hover:border-primary"
                  : "animate-soft-pulse border-primary bg-primary-soft hover:bg-primary/20"
              )}
            >
              <StepDot n={1} done={customerDone} />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-muted">
                  {customer ? t("customer.forLabel") : t("customer.chooseFirst")}
                </span>
                <span className={cn("block truncate font-bold", customer ? "text-lg" : "text-base text-primary")}>
                  {customer ? customer.name : t("customer.tapToChoose")}
                </span>
              </span>
              {customer ? (
                <span className="shrink-0 rounded-lg bg-surface-container-high px-2.5 py-1 text-sm font-semibold">
                  {t("customer.change")}
                </span>
              ) : (
                <UserRound className="h-6 w-6 shrink-0 text-primary" aria-hidden />
              )}
            </button>

            {/* Steps 2 & 3 — progress hints (wide screens only) */}
            <div className="hidden items-center gap-2 lg:flex">
              <ChevronRight className="h-5 w-5 text-on-surface-muted" aria-hidden />
              <StepChip n={2} done={productsDone} label={t("pos.stepProducts")} />
              <ChevronRight className="h-5 w-5 text-on-surface-muted" aria-hidden />
              <StepChip n={3} done={false} label={t("pos.stepSend")} />
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* -- Left: catalog -- */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t("pos.stepProducts")}>
          <ProductGrid
            products={products}
            categories={categories ?? []}
            isStale={isStale}
            onAdd={addToTray}
          />
        </section>

        {/* -- Right: order tray — ALWAYS visible from tablet up -- */}
        <aside className="hidden shrink-0 flex-col overflow-hidden border-l border-border bg-surface-container-lowest p-3 md:flex md:w-[clamp(15rem,34%,20rem)] lg:w-[clamp(18rem,30%,24rem)] 2xl:w-[28rem]">
          <CartPanel
            placing={placing}
            onSubmit={submitTicket}
            onPickCustomer={() => setCustomerPickerOpen(true)}
          />
        </aside>
      </div>

      {/* -- Phones: sticky tray bar → full-screen sheet -- */}
      <div className="shrink-0 border-t border-border bg-surface p-2 md:hidden kbd-open:hidden short:p-1">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={cn(
            "flex h-14 short:h-12 w-full items-center gap-3 rounded-2xl px-4 font-bold transition-colors",
            productsDone ? "bg-success text-white" : "bg-surface-container-high text-on-surface-muted"
          )}
        >
          <ReceiptText className="h-6 w-6 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">
            {productsDone
              ? t("pos.trayCount", { count: filled.length, pcs: totalPcs })
              : t("pos.cartEmpty")}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-sm">
            {t("pos.viewTray")}
            <ChevronRight className="h-5 w-5" />
          </span>
        </button>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] md:hidden">
          <CartPanel
            placing={placing}
            onSubmit={submitTicket}
            onPickCustomer={() => setCustomerPickerOpen(true)}
            onClose={() => setDrawerOpen(false)}
          />
        </div>
      )}

      <CustomerPicker open={customerPickerOpen} onClose={() => setCustomerPickerOpen(false)} />

      {/* First-load spinner (catalog) */}
      {!products && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
          <LoadingArea label={t("common.loading")} />
        </div>
      )}
    </div>
  );
}

// ============================================================
// SECTION: Step indicators
// ============================================================

function StepDot({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold",
        done ? "bg-success text-white" : "bg-primary text-on-primary"
      )}
    >
      {done ? <Check className="h-5 w-5" /> : n}
    </span>
  );
}

function StepChip({ n, done, label }: { n: number; done: boolean; label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full bg-surface-container-low py-1 pl-1 pr-3.5 text-sm font-semibold">
      <span
        aria-hidden
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
          done ? "bg-success text-white" : "bg-surface-container-highest text-on-surface-muted"
        )}
      >
        {done ? <Check className="h-4 w-4" /> : n}
      </span>
      {label}
    </span>
  );
}
