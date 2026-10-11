"use client";

// ============================================================
// SECTION: Locale toggle (EN ⇄ EL)
// ------------------------------------------------------------
// Rounds the "language support ready for Greek" requirement:
// every screen's labels come from the dictionary, this button
// flips them live. Persisted per device.
// ============================================================

import { useLocaleStore } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function LocaleToggle() {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  const next = locale === "en" ? "el" : "en";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setLocale(next)}
      aria-label={locale === "en" ? "Αλλαγή σε Ελληνικά" : "Switch to English"}
      title={locale === "en" ? "Ελληνικά" : "English"}
      className="font-semibold"
    >
      {/* Show the language you'd switch TO, flag-style */}
      <span className="text-xs uppercase">{next}</span>
    </Button>
  );
}
