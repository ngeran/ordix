"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { Crown, Pencil, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { hasAdminAccess, ROLE_LABEL, type UserRole } from "@/lib/roles";
import type { PublicUser } from "@/lib/user-service";
import { api, showErrorToast } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/ui/field";
import { LoadingArea } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================
// SECTION: Admin users screen
// ------------------------------------------------------------
// The team: who can sign in, with which role. Each person's
// display name is what orders show ("Taken by Maria"). No delete
// — orders keep pointing at their people — so leavers are
// deactivated instead. The server enforces the lock-out rules
// (not yourself, never the last admin); the UI just mirrors them.
// ============================================================

export function UsersScreen() {
  const t = useT();
  const { data, refresh } = usePolling<PublicUser[]>("/api/users", { intervalMs: 30_000 });
  const users = data ?? [];
  // Signed-in admin: gets the "you" tag and can't self-deactivate.
  const me = useMeId();
  const meIsOwner = users.some((user) => user.id === me && user.role === "owner");

  // -- Dialog state: undefined = closed, null = create, row = edit --
  const [editing, setEditing] = useState<PublicUser | null | undefined>(undefined);

  const toggleActive = async (user: PublicUser, next: boolean) => {
    try {
      await api.patch(`/api/users/${user.id}`, { isActive: next });
      refresh();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-[110rem] px-3 py-4 sm:px-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("users.title")}</h1>
        <Button onClick={() => setEditing(null)}>
          <UserPlus className="h-5 w-5" />
          {t("users.new")}
        </Button>
      </div>

      {data === null ? (
        <LoadingArea label={t("common.loading")} />
      ) : users.length === 0 ? (
        <EmptyState icon={UsersRound} title={t("users.empty")} />
      ) : (
        <ul className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,36rem),1fr))]">
          {users.map((user) => (
            <li key={user.id} className="min-w-0">
              <Card className={cn("flex h-full items-center gap-2 p-3 sm:gap-3", !user.isActive && "opacity-60")}>
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary"
                >
                  {user.name.charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-semibold">
                    <span className="truncate">{user.name}</span>
                    {user.id === me && (
                      <span className="shrink-0 rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-muted">
                        {t("users.you")}
                      </span>
                    )}
                  </p>
                  <p className="line-clamp-2 break-words text-xs text-on-surface-muted">
                    <span className="font-mono">@{user.username}</span>
                    {" · "}
                    <RoleLabel role={user.role} />
                    {!user.isActive && ` · ${t("users.deactivated")}`}
                  </p>
                </div>

                {user.role !== "owner" && (
                  <Switch
                    checked={user.isActive}
                    disabled={user.id === me}
                    onChange={(next) => toggleActive(user, next)}
                    aria-label={t("common.active")}
                  />
                )}
                {(user.role !== "owner" || meIsOwner) && (
                  <Button variant="secondary" size="sm" className="shrink-0 max-sm:w-10 max-sm:px-0" onClick={() => setEditing(user)} aria-label={t("common.edit")}>
                    <Pencil className="h-4 w-4" />
                    <span className="hidden sm:inline">{t("common.edit")}</span>
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing !== undefined && (
        <UserFormDialog
          user={editing}
          isMe={editing !== null && editing.id === me}
          onClose={() => setEditing(undefined)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

/** Signed-in user id, read from the session endpoint once. */
function useMeId(): string | undefined {
  const { data } = usePolling<{ user?: { id?: string } }>("/api/auth/session", {
    intervalMs: 300_000,
  });
  return data?.user?.id;
}

function RoleLabel({ role }: { role: UserRole }) {
  const t = useT();
  return hasAdminAccess(role) ? (
    <span className="inline-flex items-center gap-0.5 font-semibold text-primary">
      {role === "owner" ? (
        <Crown className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
      )}
      {t(ROLE_LABEL[role])}
    </span>
  ) : (
    <span>{t("users.roleStaff")}</span>
  );
}

// ============================================================
// SECTION: User form dialog (create + edit)
// ------------------------------------------------------------
// Password is required on create; on edit it's an optional
// reset (empty = unchanged). Usernames are lowercased as typed.
// ============================================================

function UserFormDialog({
  user,
  isMe,
  onClose,
  onSaved,
}: {
  user: PublicUser | null;
  isMe: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isEdit = user !== null;
  const isOwnerAccount = user?.role === "owner";

  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(user?.role ?? "staff");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  const usernameValid = /^[a-z0-9._-]{2,32}$/.test(username);
  const passwordValid = isEdit ? password.length === 0 || password.length >= 6 : password.length >= 6;
  const canSave = name.trim().length > 0 && usernameValid && passwordValid;

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        username,
        ...(isOwnerAccount ? {} : { role, isActive }),
        ...(password ? { password } : {}),
      };
      if (isEdit) {
        await api.patch(`/api/users/${user.id}`, payload);
      } else {
        await api.post("/api/users", payload);
      }
      toast.success(t("users.saved"));
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
      title={isEdit ? user.name : t("users.new")}
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
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label={t("users.name")} htmlFor="u-name" hint={t("users.nameHint")}>
          <Input id="u-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field
          label={t("users.username")}
          htmlFor="u-username"
          hint={t("users.usernameHint")}
          error={username && !usernameValid ? t("users.usernameHint") : undefined}
        >
          <Input
            id="u-username"
            value={username}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            aria-invalid={Boolean(username) && !usernameValid}
            onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s/g, ""))}
          />
        </Field>
        <Field
          label={isEdit ? t("users.newPassword") : t("users.password")}
          htmlFor="u-password"
          hint={isEdit ? t("users.newPasswordHint") : t("users.passwordHint")}
          error={password && !passwordValid ? t("users.passwordHint") : undefined}
        >
          <Input
            id="u-password"
            type="password"
            autoComplete="new-password"
            value={password}
            aria-invalid={Boolean(password) && !passwordValid}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {isOwnerAccount ? (
          <p className="rounded-xl bg-surface-container-low px-4 py-3 text-xs text-on-surface-muted">
            {t("users.ownerLocked")}
          </p>
        ) : (
        <>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t("users.role")}</legend>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
            {(["staff", "admin"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={role === value}
                disabled={isMe && value === "staff"}
                onClick={() => setRole(value)}
                className={cn(
                  "rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-50",
                  role === value ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-container-low"
                )}
              >
                <span className={cn("block font-semibold", role === value && "text-primary")}>
                  {value === "admin" ? t("users.roleAdmin") : t("users.roleStaff")}
                </span>
                <span className="block text-xs text-on-surface-muted">
                  {value === "admin" ? t("users.roleAdminHint") : t("users.roleStaffHint")}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low px-4 py-3">
          <span>
            <span className="block text-sm font-medium">{t("common.active")}</span>
            <span className="block text-xs text-on-surface-muted">{t("users.activeHint")}</span>
          </span>
          <Switch checked={isActive} disabled={isMe} onChange={setIsActive} aria-label={t("common.active")} />
        </div>
        </>
        )}
        {/* Enter submits from any field */}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
