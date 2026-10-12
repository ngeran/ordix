// ============================================================
// SECTION: Imports
// ============================================================

import type { drizzle } from "drizzle-orm/d1";
import { appSettings, type SettingKey } from "@/db/schema";

// ============================================================
// SECTION: Settings service (server-side)
// ------------------------------------------------------------
// Runtime-tunable behavior flags stored in D1. Defaults are
// coded here so a fresh database behaves sensibly:
//  - allow_oversell  = off → orders cannot exceed available stock
//  - restock_on_void = on  → voiding an item returns it to stock
// ============================================================

type Database = ReturnType<typeof drizzle>;

/** Strongly-typed snapshot of every known setting. */
export interface OrdixSettings {
  allowOversell: boolean;
  restockOnVoid: boolean;
  /**
   * Build-to-order mode (Phase 2): orders are manufactured, so
   * placing one does NOT deduct shelf stock and cancellation does
   * NOT restock. Production creates the goods instead.
   */
  buildToOrder: boolean;
}

const DEFAULTS: OrdixSettings = {
  allowOversell: false,
  restockOnVoid: true,
  buildToOrder: true,
};

/** "1"/"0" string ↔ boolean conversion. */
function toBool(value: string): boolean {
  return value === "1";
}

/** Load all settings, falling back to defaults for missing rows. */
export async function getSettings(db: Database): Promise<OrdixSettings> {
  const rows = await db.select().from(appSettings);
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return {
    allowOversell: byKey.has("allow_oversell")
      ? toBool(byKey.get("allow_oversell")!)
      : DEFAULTS.allowOversell,
    restockOnVoid: byKey.has("restock_on_void")
      ? toBool(byKey.get("restock_on_void")!)
      : DEFAULTS.restockOnVoid,
    buildToOrder: byKey.has("build_to_order")
      ? toBool(byKey.get("build_to_order")!)
      : DEFAULTS.buildToOrder,
  };
}

/** Upsert a single setting. Value must serialize to "1"/"0". */
export async function setSetting(
  db: Database,
  key: SettingKey,
  value: boolean
): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value: value ? "1" : "0" })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: value ? "1" : "0", updatedAt: new Date() },
    });
}
