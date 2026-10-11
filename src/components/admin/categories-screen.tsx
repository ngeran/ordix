"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import type { Category } from "@/db/schema";
import { api } from "@/lib/api-client";
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
// SECTION: Admin categories screen
// ------------------------------------------------------------
// List with move-up/move-down reordering (persisted through the
// reorder API as one batch), create/edit dialog, delete guarded
// by the server while products reference the category.
// ============================================================

interface CategoryRow {
  id: string;
  name: string;
  nameEl: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export function CategoriesScreen() {
  const t = useT();
  const { data, refresh } = usePolling<CategoryRow[]>("/api/categories", {
    intervalMs: 30_000,
  });
  const categories = data ?? [];

  // -- Dialog state: undefined = closed, null = create, row = edit --
  const [editing, setEditing] = useState<CategoryRow | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const [busy, setBusy] = useState(false);

  // ============================================================
  // SECTION: Reorder (swap with neighbor, then persist full order)
  // ============================================================

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    // Optimistic: persist the whole array order in one call.
    try {
      await api.post("/api/categories/reorder", {
        categoryIds: reordered.map((category) => category.id),
      });
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error.generic"));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/categories/${deleting.id}`);
      toast.success(t("categories.deleted"));
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error.generic"));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("categories.title")}</h1>
        <Button onClick={() => setEditing(null)}>
          <Plus className="h-5 w-5" />
          {t("categories.new")}
        </Button>
      </div>

      {data === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : categories.length === 0 ? (
        <EmptyState icon={FolderTree} title={t("categories.empty")} />
      ) : (
        <ul className="space-y-2">
          {categories.map((category, index) => (
            <li key={category.id}>
              <Card className="flex items-center gap-3 p-3">
                {/* Reorder controls */}
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="iconSm"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={t("categories.moveUp")}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    disabled={index === categories.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={t("categories.moveDown")}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {category.name}
                    {!category.isActive && (
                      <span className="ml-2 rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-medium text-on-surface-muted">
                        {t("common.inactive")}
                      </span>
                    )}
                  </p>
                  {category.nameEl && (
                    <p className="truncate text-xs text-on-surface-muted">{category.nameEl}</p>
                  )}
                  <p className="text-xs text-on-surface-muted">
                    {category.productCount} {t("common.items")}
                  </p>
                </div>

                <Button variant="secondary" size="sm" onClick={() => setEditing(category)}>
                  <Pencil className="h-4 w-4" />
                  {t("common.edit")}
                </Button>
                <Button variant="ghost" size="iconSm" onClick={() => setDeleting(category)} aria-label={t("common.delete")}>
                  <Trash2 className="h-4 w-4 text-error" />
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* -- Create / edit dialog -- */}
      {editing !== undefined && (
        <CategoryFormDialog
          category={editing}
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
          {t("categories.deleteConfirm", { name: deleting?.name ?? "" })}
        </p>
      </Dialog>
    </div>
  );
}

// ============================================================
// SECTION: Category form dialog (create + edit)
// ============================================================

function CategoryFormDialog({
  category,
  onClose,
  onSaved,
}: {
  category: CategoryRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isEdit = category !== null;

  const [name, setName] = useState("");
  const [nameEl, setNameEl] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setNameEl(category.nameEl ?? "");
      setDescription(category.description ?? "");
      setIsActive(category.isActive);
    } else {
      setName("");
      setNameEl("");
      setDescription("");
      setIsActive(true);
    }
  }, [category]);

  const submit = async () => {
    if (name.trim().length === 0) return;
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        nameEl: nameEl.trim() || undefined,
        description: description.trim() || undefined,
        isActive,
      };
      if (isEdit) {
        await api.patch(`/api/categories/${category.id}`, payload);
      } else {
        await api.post("/api/categories", payload);
      }
      toast.success(t("categories.saved"));
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? category.name : t("categories.new")}
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
      <div className="space-y-4">
        <Field label={t("categories.name")} htmlFor="c-name">
          <Input id="c-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label={t("categories.nameEl")} htmlFor="c-name-el">
          <Input id="c-name-el" value={nameEl} onChange={(event) => setNameEl(event.target.value)} placeholder="Κατηγορία…" />
        </Field>
        <Field label={t("products.description")} htmlFor="c-desc">
          <Textarea id="c-desc" value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <div className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3">
          <span className="text-sm font-medium">{t("common.active")}</span>
          <Switch checked={isActive} onChange={setIsActive} aria-label={t("common.active")} />
        </div>
      </div>
    </Dialog>
  );
}
