// ============================================================
// SECTION: Imports
// ============================================================

import { z } from "zod";

// ============================================================
// SECTION: App settings (admin → Settings)
// ------------------------------------------------------------
// Shared by server (layout, API) and client (shell, toggles).
// Every field has a default, so parsing an empty / older stored
// document always yields a complete object — adding a setting
// later needs no migration.
//
//   language — default UI language, and whether users may switch
//   theme    — "user" lets everyone pick; dark/light forces one
//   features — switch whole parts of the app on/off for everyone
//   business — name + logo shown in the app and on exports
// ============================================================

/** Logos are stored inline (data URL) — keep them small. */
export const MAX_LOGO_BYTES = 200_000;

export const settingsSchema = z.object({
  language: z
    .object({
      default: z.enum(["el", "en"]).default("el"),
      allowSwitch: z.boolean().default(true),
    })
    .prefault({}),
  theme: z
    .object({
      mode: z.enum(["user", "dark", "light"]).default("user"),
    })
    .prefault({}),
  features: z
    .object({
      /** Wall display board (/display) + its nav/home links. */
      displayBoard: z.boolean().default(true),
      /** Save new orders offline and send them when back online. */
      offlineQueue: z.boolean().default(true),
      /** "Install app" button (PWA). */
      installApp: z.boolean().default(true),
      /** Full-screen button in the header. */
      fullscreenButton: z.boolean().default(true),
    })
    .prefault({}),
  business: z
    .object({
      name: z.string().trim().max(60).default(""),
      logoUrl: z
        .string()
        .max(Math.ceil(MAX_LOGO_BYTES * 1.4), "Logo is too large")
        .refine((value) => value.startsWith("data:image/"), "Logo must be an image")
        .nullable()
        .default(null),
    })
    .prefault({}),
});

export type AppSettings = z.output<typeof settingsSchema>;
export type FeatureKey = keyof AppSettings["features"];

export const DEFAULT_SETTINGS: AppSettings = settingsSchema.parse({});

/** Lenient read: invalid/corrupt stored JSON falls back to defaults. */
export function parseStoredSettings(raw: string | null | undefined): AppSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Name shown in the sidebar, login and exports. */
export function businessName(settings: AppSettings): string {
  return settings.business.name || "Ordix";
}
