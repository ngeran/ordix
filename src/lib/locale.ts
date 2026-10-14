// ============================================================
// SECTION: Locale resolution (server-safe — no "use client")
// ------------------------------------------------------------
// Shared by the root layout (server) and the i18n store (client):
// the language to show is the device's saved choice (cookie) when
// switching is allowed, otherwise — or with no choice yet — the
// business default from Settings.
// ============================================================

export const LOCALES = ["en", "el"] as const;
export type Locale = (typeof LOCALES)[number];

/** Device's EN/EL choice; read by the server to render it directly. */
export const LOCALE_COOKIE = "ordix-locale";

export interface LanguageRules {
  default: Locale;
  allowSwitch: boolean;
}

export function resolveLocale(rules: LanguageRules, saved: string | null | undefined): Locale {
  return rules.allowSwitch && (saved === "en" || saved === "el") ? saved : rules.default;
}
