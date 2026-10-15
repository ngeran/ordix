// ============================================================
// SECTION: Imports
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { DEFAULT_SETTINGS, parseStoredSettings, type AppSettings } from "@/lib/settings";

// ============================================================
// SECTION: Server-side settings access
// ------------------------------------------------------------
// The root layout reads settings on every full page load (one
// primary-key lookup) and hands them to the client shell. Any
// failure — e.g. the 0006 migration not applied yet — degrades
// to defaults instead of taking the whole app down.
// ============================================================

export const SETTINGS_KEY = "app";

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const db = await getDb();
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEY))
      .limit(1);
    return parseStoredSettings(row?.value);
  } catch (error) {
    console.error("[settings] read failed, using defaults:", error);
    return DEFAULT_SETTINGS;
  }
}
