"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================
// SECTION: PWA install button + service-worker registration
// ------------------------------------------------------------
// Captures the browser's `beforeinstallprompt` event and shows
// the install action only when installation is actually offered
// (Chrome/Edge/Android). Hidden once the app runs standalone.
// Also registers /sw.js once per session.
// ============================================================

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallAppButton({
  className,
  variant = "full",
}: {
  className?: string;
  /** "full" = sidebar button with label, "compact" = header icon. */
  variant?: "full" | "compact";
}) {
  const t = useT();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // -- Service worker (offline shell) — register once --
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW is progressive enhancement; ignore failures (e.g. http:// LAN).
      });
    }

    // -- Install prompt capture --
    const onBeforeInstall = (event: Event) => {
      event.preventDefault(); // keep our own button, not the mini-infobar
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // -- Already installed? (standalone window) --
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  // Nothing to offer (already installed or unsupported browser).
  if (!installEvent || isStandalone) return null;

  const install = async () => {
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstallEvent(null);
  };

  if (variant === "compact") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={install}
        aria-label={t("nav.install")}
        title={t("nav.install")}
        className={className}
      >
        <Download className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Button variant="secondary" onClick={install} className={cn("justify-start", className)}>
      <Download className="h-5 w-5" />
      {t("nav.install")}
    </Button>
  );
}
