"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import { Clock, Search, UserPlus, UserRound, X } from "lucide-react";
import type { Customer } from "@/db/schema";
import { api, showErrorToast } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { toast } from "@/stores/toast-store";
import { useCartStore, type CartCustomer } from "@/stores/cart-store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  CustomFieldInputs,
  customFieldsComplete,
  useCustomFields,
  type CustomDraft,
} from "@/components/custom-fields/custom-field-inputs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================
// SECTION: Customer picker — order step 1
// ------------------------------------------------------------
// Dialog flow: search (name/phone) → tap a row to select. The
// last few customers chosen on this device sit on top as big
// "Recent" chips (most orders are repeat customers). If the
// customer doesn't exist, "New customer" opens a second dialog
// pre-filled with what was typed; saving selects the new
// customer straight away so the order taker never loses their
// place.
// ============================================================

const RECENT_KEY = "ordix-recent-customers";
const RECENT_MAX = 6;

function readRecent(): CartCustomer[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as CartCustomer[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function rememberRecent(customer: CartCustomer) {
  try {
    const next = [customer, ...readRecent().filter((c) => c.id !== customer.id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — recents just won't persist
  }
}

export function CustomerPicker({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const setCustomer = useCartStore((state) => state.setCustomer);

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [recent, setRecent] = useState<CartCustomer[]>([]);

  const { data: customers } = usePolling<Customer[]>(
    `/api/customers?active=true${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""}`,
    { intervalMs: 60_000, enabled: open }
  );

  const select = (customer: CartCustomer) => {
    setCustomer(customer);
    rememberRecent(customer);
    onClose();
  };

  // Reset the search and reload recents each time the picker opens.
  useEffect(() => {
    if (open) {
      setSearch("");
      setRecent(readRecent());
    }
  }, [open]);

  return (
    <>
      <Dialog open={open} onClose={onClose} title={t("customer.select")}>
        <div className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-muted"
              aria-hidden
            />
            <Input
              type="search"
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("customer.search")}
              aria-label={t("common.search")}
              className="h-14 pl-11 pr-11 text-lg"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label={t("pos.clearSearch")}
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-on-surface-muted hover:bg-surface-container"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Recent customers on this device — one tap */}
          {!search.trim() && recent.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-muted">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {t("customer.recent")}
              </p>
              <div className="flex flex-wrap gap-2">
                {recent.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => select(customer)}
                    className="flex h-12 max-w-full items-center gap-2 rounded-full border-2 border-primary/30 bg-primary-soft pl-1.5 pr-4 font-semibold text-primary hover:border-primary"
                  >
                    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
                      {customer.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{customer.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {customers === null ? null : customers.length === 0 ? (
            <EmptyState icon={UserRound} title={t("customer.empty")} />
          ) : (
            <ul className="space-y-1.5">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <button
                    onClick={() =>
                      select({ id: customer.id, name: customer.name })
                    }
                    className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-primary"
                  >
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary"
                    >
                      {customer.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {customer.name}
                      </span>
                      <span className="block truncate text-sm text-on-surface-muted">
                        {customer.phone ?? t("customer.noPhone")}
                        {customer.address ? ` · ${customer.address}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => setCreateOpen(true)}
          >
            <UserPlus className="h-5 w-5" />
            {t("customer.new")}
          </Button>
        </div>
      </Dialog>

      <NewCustomerDialog
        open={createOpen}
        initialName={search.trim()}
        onClose={() => setCreateOpen(false)}
        onCreated={select}
      />
    </>
  );
}

// ============================================================
// SECTION: New customer dialog (the 5 fields from the flow)
// ============================================================

function NewCustomerDialog({
  open,
  initialName,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** What was typed in the search box — saves retyping. */
  initialName: string;
  onClose: () => void;
  onCreated: (customer: CartCustomer) => void;
}) {
  const t = useT();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const customFields = useCustomFields("customers");
  const [custom, setCustom] = useState<CustomDraft>({});
  const canSave = name.trim().length > 0 && customFieldsComplete(customFields, custom);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (open) {
      setName(/\d/.test(initialName) ? "" : initialName);
      setPhone(/\d/.test(initialName) ? initialName : "");
      setAddress("");
      setEmail("");
      setComments("");
      setCustom({});
    }
    // initialName is read once per opening on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const created = await api.post<Customer>("/api/customers", {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        comments: comments.trim() || undefined,
        ...(customFields.length > 0 ? { extra: custom } : {}),
      });
      toast.success(t("customer.saved"));
      onCreated({ id: created.id, name: created.name });
      onClose();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("customer.newTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={busy} disabled={!canSave} onClick={submit}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t("customer.name")} htmlFor="c-name">
          <Input
            id="c-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <Field label={t("customer.phone")} htmlFor="c-phone">
          <Input
            id="c-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
        <Field label={t("customer.address")} htmlFor="c-address">
          <Input
            id="c-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </Field>
        <Field label={t("customer.email")} htmlFor="c-email">
          <Input
            id="c-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label={t("customer.comments")} htmlFor="c-comments">
          <Textarea
            id="c-comments"
            value={comments}
            onChange={(event) => setComments(event.target.value)}
          />
        </Field>
        <CustomFieldInputs fields={customFields} values={custom} onChange={setCustom} />
      </div>
    </Dialog>
  );
}
