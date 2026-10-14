"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { create } from "zustand";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";

// ============================================================
// SECTION: App settings store (client mirror)
// ------------------------------------------------------------
// Seeded synchronously by AppShell from the server-rendered
// settings (so the very first render already respects them) and
// refreshed after an admin saves the Settings page. Non-React
// code (api-client's offline queue) reads it via getState().
// ============================================================

interface SettingsState {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: DEFAULT_SETTINGS,
  setSettings: (settings) => set({ settings }),
}));

export const useAppSettings = () => useSettingsStore((state) => state.settings);
