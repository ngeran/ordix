"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import { Pencil, Search, Trash2, UserPlus, UserRound } from "lucide-react";
import type { Customer } from "@/db/schema";
import { api, showErrorToast } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/ui/field";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================
// SECTION: Admin customers screen
// ------------------------------------------------------------
// The customer directory: search, create, edit (the five fields),
// activate/deactivate, delete (soft when orders exist). Mirrors
// the categories screen patterns.
// ============================================================

export function CustomersAdminScreen() {
  const t = useT();

  const [search, setSearch] = useState("");
  const { data, refresh } = usePolling<Customer[]>(
    `/api/customers${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`,
    { intervalMs: 30_000 }
  );
  const customers = data ?? [];

  // -- Dialog state: undefined = closed, null = create, row = edit --
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleActive = async (customer: Customer, next: boolean) => {
    try {
      await api.patch<Customer>(`/api/customers/${customer.id}`, {
        isActive: next,
      });
      refresh();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const result = await api.delete<{ deleted: boolean; deactivated: boolean }>(
        `/api/customers/${deleting.id}`
      );
      if (result.deactivated) {
        toast.info(t("customers.deleteConfirm", { name: deleting.name }));
      } else {
        toast.success(t("customers.deleted"));
      }
      refresh();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[110rem] px-3 py-4 sm:px-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("customers.title")}</h1>
        <Button onClick={() => setEditing(null)}>
          <UserPlus className="h-5 w-5" />
          {t("customers.new")}
        </Button>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-muted"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("customer.search")}
            aria-label={t("common.search")}
            className="pl-11"
          />
        </div>
      </div>

      {data === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : customers.length === 0 ? (
        <EmptyState icon={UserRound} title={t("customers.empty")} />
      ) : (
        <ul className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,36rem),1fr))]">
          {customers.map((customer) => (
            <li key={customer.id} className="min-w-0">
              <Card
                className={cnClass(
                  "flex h-full items-center gap-2 p-3 sm:gap-3",
                  !customer.isActive && "opacity-60"
                )}
              >
                <span
                  aria-hidden
                  className="hidden h-10 w-10 shrink-0 min-[400px]:flex items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary"
                >
                  {customer.name.charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{customer.name}</p>
                  <p className="line-clamp-2 break-words text-xs text-on-surface-muted">
                    {customer.phone ?? t("customer.noPhone")}
                    {customer.address ? ` · ${customer.address}` : ""}
                    {customer.comments ? ` · ${customer.comments}` : ""}
                  </p>
                </div>

                <Switch
                  checked={customer.isActive}
                  onChange={(next) => toggleActive(customer, next)}
                  aria-label={t("common.active")}
                />

                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0 max-sm:w-10 max-sm:px-0"
                  onClick={() => setEditing(customer)}
                  aria-label={t("common.edit")}
                >
                  <Pencil className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("common.edit")}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="h-11 w-11 shrink-0"
                  onClick={() => setDeleting(customer)}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="h-4 w-4 text-error" />
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* -- Create / edit dialog -- */}
      {editing !== undefined && (
        <CustomerFormDialog
          customer={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => refresh()}
        />
      )}

      {/* -- Delete confirmation -- */}
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("common.delete")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" loading={busy} onClick={confirmDelete}>
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-on-surface-muted">
          {t("customers.deleteConfirm", { name: deleting?.name ?? "" })}
        </p>
      </Dialog>
    </div>
  );
}

// Tailwind class joiner kept local (cn without the tailwind-merge
// import weight for a single file use).
function cnClass(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ============================================================
// SECTION: Customer form dialog (create + edit)
// ============================================================

function CustomerFormDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isEdit = customer !== null;

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [comments, setComments] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (customer) {
      setName(customer.name);
      setAddress(customer.address ?? "");
      setPhone(customer.phone ?? "");
      setEmail(customer.email ?? "");
      setComments(customer.comments ?? "");
      setIsActive(customer.isActive);
    } else {
      setName("");
      setAddress("");
      setPhone("");
      setEmail("");
      setComments("");
      setIsActive(true);
    }
  }, [customer]);

  const submit = async () => {
    if (name.trim().length === 0) return;
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        comments: comments.trim() || undefined,
        isActive,
      };
      if (isEdit) {
        await api.patch(`/api/customers/${customer.id}`, payload);
      } else {
        await api.post("/api/customers", payload);
      }
      toast.success(t("customer.saved"));
      onSaved();
      onClose();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? customer.name : t("customers.new")}
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
        <Field label={t("customer.name")} htmlFor="ac-name">
          <Input
            id="ac-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <Field label={t("customer.phone")} htmlFor="ac-phone">
          <Input
            id="ac-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
        <Field label={t("customer.address")} htmlFor="ac-address">
          <Input
            id="ac-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </Field>
        <Field label={t("customer.email")} htmlFor="ac-email">
          <Input
            id="ac-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label={t("customer.comments")} htmlFor="ac-comments">
          <Textarea
            id="ac-comments"
            value={comments}
            onChange={(event) => setComments(event.target.value)}
          />
        </Field>
        <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3">
          <span className="text-sm font-medium">{t("common.active")}</span>
          <Switch checked={isActive} onChange={setIsActive} aria-label={t("common.active")} />
        </div>
      </div>
    </Dialog>
  );
}
