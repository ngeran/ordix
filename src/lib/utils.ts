// ============================================================
// SECTION: Imports
// ============================================================

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// ============================================================
// SECTION: CSS class utilities
// ============================================================

/** Merge Tailwind classes with conflict resolution (shadcn convention). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ============================================================
// SECTION: Money & number formatting
// ------------------------------------------------------------
// All amounts are integer cents end-to-end; formatting happens
// only at the render boundary.
// ============================================================

/** €12.50 from 1250 cents, localized (el-GR → "12,50 €"). */
export function formatMoney(cents: number, locale: "en" | "el" = "en"): string {
  return new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

// ============================================================
// SECTION: Date & business-day helpers
// ------------------------------------------------------------
// The business date drives the daily order-number reset; it is
// computed in APP_TIMEZONE (default Europe/Athens) so a 23:50
// order and a 00:10 order land on the correct business day.
// ============================================================

/** Timezone for business-day boundaries (env-overridable). */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Europe/Athens";

/** Current business date as "YYYY-MM-DD" in APP_TIMEZONE. */
export function getBusinessDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE, // en-CA yields ISO-like YYYY-MM-DD
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Timestamp for tables/lists — locale-aware, compact. */
export function formatDateTime(
  value: Date | string | number,
  locale: "en" | "el" = "en"
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/** "3 min ago" style relative time for boards. */
export function formatRelativeTime(
  value: Date | string | number,
  locale: "en" | "el" = "en"
): string {
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale === "el" ? "el" : "en", {
    numeric: "auto",
  });
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

// ============================================================
// SECTION: Misc helpers
// ============================================================

/** Clamp helper for quantity inputs. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
