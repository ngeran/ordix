"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { RefreshCw, WifiOff } from "lucide-react";
import { flushOutbox } from "@/lib/offline-outbox";
import { useSyncStore } from "@/stores/sync-store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

// ============================================================
// SECTION: Sync indicator (header)
// ------------------------------------------------------------
// Visible whenever this device is offline OR has queued
// mutations. Tap forces a sync attempt. Hidden when online with
// an empty outbox — absence means "everything synced".
// ============================================================

export function SyncIndicator() {
  const t = useT();
  const pending = useSyncStore((state) => state.pending);
  const isOnline = useSyncStore((state) => state.isOnline);

  // Fully synced and online → render nothing (no noise by default).
  if (isOnline && pending === 0) return null;

  const handleClick = () => {
    void flushOutbox();
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      aria-label={isOnline ? t("offline.pending", { count: pending }) : t("offline.offline")}
      title={isOnline ? t("offline.pending", { count: pending }) : t("offline.offline")}
      className="relative"
    >
      {isOnline ? (
        <RefreshCw className="h-5 w-5 text-warning" />
      ) : (
        <WifiOff className="h-5 w-5 text-warning" />
      )}
      {pending > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1 text-[11px] font-bold text-on-background">
          {pending}
        </span>
      )}
    </Button>
  );
}
