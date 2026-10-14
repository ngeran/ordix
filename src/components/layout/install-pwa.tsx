"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ============================================================
// SECTION: Service-worker registration (offline shell)
// ------------------------------------------------------------
// Called once by AppShell on every route — independent of the
// install button, which Settings can hide (it used to live inside
// it, so hiding the button silently disabled offline support).
// Production only: in `next dev` chunk URLs aren't content-hashed,
// so the SW's cache-first asset rule would keep serving stale JS.
// Dev therefore removes any SW + caches left behind.
// ============================================================

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV === "production") {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW is progressive enhancement; ignore failures (e.g. http:// LAN).
    });
    return;
  }
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) void registration.unregister();
  });
  void window.caches?.keys().then((names) => {
    for (const name of names) if (name.startsWith("ordix-")) void window.caches.delete(name);
  });
}

// ============================================================
// SECTION: PWA install button
// ------------------------------------------------------------
// Chromium (Chrome/Edge/Android): captures `beforeinstallprompt`
// and offers the native install. Safari on iPad / iPhone has no
// such event — the button opens a short "Share → Add to Home
// Screen" guide instead (iPadOS reports itself as a Mac, hence the
// touch-points check). Hidden once the app runs standalone, and on
// browsers that can't install at all.
// ============================================================

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isAppleMobileSafari(): boolean {
  const ua = navigator.userAgent;
  const appleTouch = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // Other iOS browsers (CriOS, FxiOS, EdgiOS) can't add to home screen the same way.
  return appleTouch && !/CriOS|FxiOS|EdgiOS/.test(ua);
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
  const [iosGuide, setIosGuide] = useState<"no" | "available" | "open">("no");

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault(); // keep our own button, not the mini-infobar
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
    if (isAppleMobileSafari()) setIosGuide("available");

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  // Nothing to offer (already installed or unsupported browser).
  if (isStandalone || (!installEvent && iosGuide === "no")) return null;

  const install = async () => {
    if (!installEvent) {
      setIosGuide("open");
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstallEvent(null);
  };

  const guide = (
    <Dialog open={iosGuide === "open"} onClose={() => setIosGuide("available")} title={t("nav.install")}>
      <ol className="space-y-3 text-sm">
        <li className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary">1</span>
          <span className="pt-0.5">
            {t("install.iosStep1")} <Share className="inline h-4 w-4 align-text-bottom text-primary" aria-hidden />
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary">2</span>
          <span className="pt-0.5">
            {t("install.iosStep2")} <SquarePlus className="inline h-4 w-4 align-text-bottom text-primary" aria-hidden />
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary">3</span>
          <span className="pt-0.5">{t("install.iosStep3")}</span>
        </li>
      </ol>
    </Dialog>
  );

  if (variant === "compact") {
    return (
      <>
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
        {guide}
      </>
    );
  }

  return (
    <>
      <Button variant="secondary" onClick={install} className={cn("justify-start", className)}>
        <Download className="h-5 w-5" />
        {t("nav.install")}
      </Button>
      {guide}
    </>
  );
}
