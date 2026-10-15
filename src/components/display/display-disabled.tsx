"use client";

// ============================================================
// SECTION: Display board — switched off (admin → Settings)
// ------------------------------------------------------------
// /display renders without app chrome, so this needs its own
// way back home.
// ============================================================

import Link from "next/link";
import { MonitorOff } from "lucide-react";
import { useT } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/empty-state";

export function DisplayDisabled() {
  const t = useT();
  return (
    <div className="flex h-app flex-col items-center justify-center gap-4 bg-background p-6">
      <EmptyState icon={MonitorOff} title={t("display.disabled")} />
      <Link href="/home" className="font-semibold text-primary hover:underline">
        {t("nav.home")}
      </Link>
    </div>
  );
}
