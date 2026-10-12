"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import { Search, UserPlus, UserRound } from "lucide-react";
import type { Customer } from "@/db/schema";
import { api, showErrorToast } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { toast } from "@/stores/toast-store";
import { useCartStore, type CartCustomer } from "@/stores/cart-store";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================
// SECTION: Customer picker — order step 1
// ------------------------------------------------------------
// Dialog flow: search (name/phone) → tap a row to select. If the
// customer doesn't exist, "Νέος πελάτης" opens a second dialog
// with the five fields; saving selects the new customer straight
// away so the order taker never loses their place.
// ============================================================

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

  const { data: customers } = usePolling<Customer[]>(
    `/api/customers?active=true${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""}`,
    { intervalMs: 60_000, enabled: open }
  );

  const select = (customer: CartCustomer) => {
    setCustomer(customer);
    onClose();
  };

  // Reset the search each time the picker opens.
  useEffect(() => {
    if (open) setSearch("");
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
              className="pl-11"
            />
          </div>

          {customers === null ? null : customers.length === 0 ? (
            <EmptyState icon={UserRound} title={t("customer.empty")} />
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto scrollbar-thin">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <button
                    onClick={() =>
                      select({ id: customer.id, name: customer.name })
                    }
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-primary"
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
  onClose,
  onCreated,
}: {
  open: boolean;
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

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (open) {
      setName("");
      setAddress("");
      setPhone("");
      setEmail("");
      setComments("");
    }
  }, [open]);

  const submit = async () => {
    if (name.trim().length === 0) return;
    setBusy(true);
    try {
      const created = await api.post<Customer>("/api/customers", {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        comments: comments.trim() || undefined,
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
          <Button loading={busy} disabled={name.trim().length === 0} onClick={submit}>
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
      </div>
    </Dialog>
  );
}
