"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ============================================================
// SECTION: Fullscreen toggle
// ------------------------------------------------------------
// Installed PWAs already launch fullscreen (manifest display
// mode). In a plain browser tab this button hides the browser
// UI via the Fullscreen API. Renders nothing where the API is
// missing (iPhone Safari) or the app already runs fullscreen.
// ============================================================

export function FullscreenToggle({ className }: { className?: string }) {
  const t = useT();
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const launchedFullscreen = window.matchMedia("(display-mode: fullscreen)").matches;
    setSupported(document.fullscreenEnabled && !launchedFullscreen);

    const sync = () => setActive(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        // Denied (e.g. iframe policy) — the button simply does nothing.
      });
    }
  };

  const label = active ? t("nav.exitFullscreen") : t("nav.fullscreen");

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(className)}
    >
      {active ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
    </Button>
  );
}
