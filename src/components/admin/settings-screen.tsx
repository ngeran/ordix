"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Crown, Languages, Palette, Save, ToggleRight, Trash2, TriangleAlert, Upload } from "lucide-react";
import { api, showErrorToast } from "@/lib/api-client";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  businessName,
  MAX_LOGO_BYTES,
  type AppSettings,
  type FeatureKey,
} from "@/lib/settings";
import { useAppSettings, useSettingsStore } from "@/stores/settings-store";
import { toast } from "@/stores/toast-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BrandMark } from "@/components/layout/app-shell";
import { BackupCard, CustomFieldsCard } from "@/components/admin/owner-tools";

// ============================================================
// SECTION: Settings screen (admin)
// ------------------------------------------------------------
// Edits a local draft of the whole settings document; Save PUTs
// it and refreshes the router so the layout re-renders with the
// new values (language lock, theme, nav, brand) everywhere at
// once. Starts from the store, which the shell seeded from the
// server render — no loading state needed.
// ============================================================

const FEATURES: FeatureKey[] = ["displayBoard", "offlineQueue", "installApp", "fullscreenButton"];

export function SettingsScreen({ isOwner }: { isOwner: boolean }) {
  const t = useT();
  const router = useRouter();
  const saved = useAppSettings();
  const [draft, setDraft] = useState<AppSettings>(saved);
  const [busy, setBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  // Pick up a newer saved document (e.g. after save + refresh).
  useEffect(() => setDraft(saved), [saved]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const update = <K extends keyof AppSettings>(section: K, patch: Partial<AppSettings[K]>) =>
    setDraft((current) => ({ ...current, [section]: { ...current[section], ...patch } }));

  const loadLogo = (file: File) => {
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t("settings.logoTooBig"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("business", { logoUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setBusy(true);
    try {
      const result = await api.put<AppSettings>("/api/settings", draft);
      useSettingsStore.getState().setSettings(result);
      toast.success(t("settings.saved"));
      router.refresh();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[110rem] px-3 pb-32 pt-4 sm:px-5">
      <h1 className="mb-4 text-2xl font-bold">{t("settings.title")}</h1>

      {/* Two columns on xl+: language/theme/business | features (keeps each card readable) */}
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <div className="space-y-4">
        {/* ============================================================
            SECTION: Feature switches
            ============================================================ */}
        <Section icon={ToggleRight} title={t("settings.features")}>
          {FEATURES.map((feature) => (
            <ToggleRow
              key={feature}
              label={t(`settings.feature.${feature}` as MessageKey)}
              hint={t(`settings.feature.${feature}Hint` as MessageKey)}
              checked={draft.features[feature]}
              onChange={(on) => update("features", { [feature]: on })}
            />
          ))}
        </Section>

        {/* ============================================================
            SECTION: Business details
            ============================================================ */}
        <Section icon={Building2} title={t("settings.business")}>
          <Field label={t("settings.businessName")} htmlFor="s-bname" hint={t("settings.businessNameHint")}>
            <Input
              id="s-bname"
              value={draft.business.name}
              maxLength={60}
              placeholder="Ordix"
              onChange={(event) => update("business", { name: event.target.value })}
            />
          </Field>

          <div>
            <p className="mb-1.5 text-sm font-medium">{t("settings.logo")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <BrandMark
                name={businessName(draft)}
                logoUrl={draft.business.logoUrl}
                className="h-14 w-14 rounded-2xl text-2xl"
              />
              <Button variant="outline" onClick={() => logoInput.current?.click()}>
                <Upload className="h-5 w-5" />
                {t("settings.logoUpload")}
              </Button>
              {draft.business.logoUrl && (
                <Button variant="ghost" onClick={() => update("business", { logoUrl: null })}>
                  <Trash2 className="h-5 w-5 text-error" />
                  {t("settings.logoRemove")}
                </Button>
              )}
              <input
                ref={logoInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) loadLogo(file);
                  event.target.value = "";
                }}
              />
            </div>
            <p className="mt-1.5 text-xs text-on-surface-muted">{t("settings.logoHint")}</p>
          </div>
        </Section>
        </div>

        <div className="space-y-4">
        {/* ============================================================
            SECTION: Theme
            ============================================================ */}
        <Section icon={Palette} title={t("settings.theme")}>
          <Segmented
            value={draft.theme.mode}
            options={[
              ["user", t("settings.themeUser")],
              ["dark", t("settings.themeDark")],
              ["light", t("settings.themeLight")],
            ]}
            onChange={(mode) => update("theme", { mode })}
          />
          <p className="text-xs text-on-surface-muted">{t("settings.themeHint")}</p>
        </Section>
        </div>

      </div>

      {/* ============================================================
          SECTION: Owner area (the server ignores language edits from admins)
          ============================================================ */}
      {isOwner && (
        <section className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Crown className="h-5 w-5 text-primary" />
            {t("settings.ownerArea")}
          </h2>
          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <Section icon={Languages} title={t("settings.language")}>
              <Field label={t("settings.languageDefault")} htmlFor="s-lang">
                <Segmented
                  value={draft.language.default}
                  options={[
                    ["el", "Ελληνικά"],
                    ["en", "English"],
                  ]}
                  onChange={(value) => update("language", { default: value })}
                />
              </Field>
              <ToggleRow
                label={t("settings.allowSwitch")}
                hint={t("settings.allowSwitchHint")}
                checked={draft.language.allowSwitch}
                onChange={(allowSwitch) => update("language", { allowSwitch })}
              />
            </Section>
            <BackupCard />
            <CustomFieldsCard />
            <DangerZone />
          </div>
        </section>
      )}

      {/* ============================================================
          SECTION: Sticky save bar (visible while there are changes)
          ============================================================ */}
      {dirty && (
        <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-surface p-3 shadow-pop">
          <span className="text-sm font-medium">{t("settings.unsaved")}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft(saved)}>
              {t("common.cancel")}
            </Button>
            <Button loading={busy} onClick={save}>
              <Save className="h-5 w-5" />
              {t("common.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SECTION: Danger zone (owner only — the server re-checks role + password)
// ============================================================

type ResetScope = "orders" | "all";

function DangerZone() {
  const t = useT();
  const router = useRouter();
  const [scope, setScope] = useState<ResetScope | null>(null);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setScope(null);
    setTyped("");
    setPassword("");
  };

  const run = async () => {
    if (!scope) return;
    setBusy(true);
    try {
      await api.post("/api/system/reset", { scope, password });
      toast.success(t("danger.done"));
      close();
      router.refresh();
    } catch (error) {
      showErrorToast(error, t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const actions: [ResetScope, MessageKey, MessageKey][] = [
    ["orders", "danger.resetOrders", "danger.resetOrdersHint"],
    ["all", "danger.resetAll", "danger.resetAllHint"],
  ];

  return (
    <Card className="space-y-3 border-error/50 p-4">
      <h2 className="flex items-center gap-2 font-semibold text-error">
        <TriangleAlert className="h-5 w-5" />
        {t("danger.title")}
      </h2>
      <p className="text-xs text-on-surface-muted">{t("danger.hint")}</p>
      {actions.map(([value, label, hint]) => (
        <div
          key={value}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-low px-4 py-3"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t(label)}</span>
            <span className="block text-xs text-on-surface-muted">{t(hint)}</span>
          </span>
          <Button variant="danger" size="sm" onClick={() => setScope(value)}>
            <Trash2 className="h-4 w-4" />
            {t(label)}
          </Button>
        </div>
      ))}

      {scope && (
        <Dialog
          open
          onClose={close}
          title={t(scope === "all" ? "danger.resetAll" : "danger.resetOrders")}
          footer={
            <>
              <Button variant="ghost" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                loading={busy}
                disabled={typed.trim().toUpperCase() !== "DELETE" || password.length === 0}
                onClick={run}
              >
                {t("danger.run")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm">
              {t(scope === "all" ? "danger.resetAllHint" : "danger.resetOrdersHint")}
            </p>
            <Field label={t("danger.typeDelete")} htmlFor="d-confirm">
              <Input
                id="d-confirm"
                autoFocus
                autoCapitalize="characters"
                autoComplete="off"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            </Field>
            <Field label={t("danger.password")} htmlFor="d-password">
              <Input
                id="d-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

// ============================================================
// SECTION: Building blocks
// ============================================================

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </h2>
      {children}
    </Card>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-container-low px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-on-surface-muted">{hint}</span>
      </span>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </div>
  );
}

function Segmented<Value extends string>({
  value,
  options,
  onChange,
}: {
  value: Value;
  options: [Value, string][];
  onChange: (value: Value) => void;
}) {
  return (
    <div role="radiogroup" className="flex w-full gap-1 rounded-xl border border-border bg-surface-container-low p-1">
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-center text-sm font-semibold transition-colors",
            value === option
              ? "bg-surface text-primary shadow-sm ring-1 ring-primary/40"
              : "text-on-surface-muted hover:bg-surface-container hover:text-on-surface"
          )}
        >
          {value === option && <Check className="h-4 w-4" aria-hidden />}
          {label}
        </button>
      ))}
    </div>
  );
}
