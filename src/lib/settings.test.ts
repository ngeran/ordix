import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, businessName, parseStoredSettings, settingsSchema } from "@/lib/settings";

describe("settings", () => {
  it("fills every default from an empty document", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      language: { default: "el", allowSwitch: true },
      theme: { mode: "user" },
      features: { displayBoard: true, offlineQueue: true, installApp: true, fullscreenButton: true },
      business: { name: "", logoUrl: null },
    });
  });

  it("keeps stored values and defaults the missing ones (older documents)", () => {
    const parsed = parseStoredSettings(JSON.stringify({ language: { allowSwitch: false }, features: { displayBoard: false } }));
    expect(parsed.language).toEqual({ default: "el", allowSwitch: false });
    expect(parsed.features.displayBoard).toBe(false);
    expect(parsed.features.offlineQueue).toBe(true);
  });

  it("falls back to defaults on corrupt JSON or invalid values", () => {
    expect(parseStoredSettings("{oops")).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings(JSON.stringify({ theme: { mode: "purple" } }))).toEqual(DEFAULT_SETTINGS);
  });

  it("only accepts image data URLs as logos", () => {
    expect(settingsSchema.safeParse({ business: { logoUrl: "https://evil.example/x.png" } }).success).toBe(false);
    expect(settingsSchema.safeParse({ business: { logoUrl: "data:image/png;base64,AAAA" } }).success).toBe(true);
  });

  it("uses Ordix when no business name is set", () => {
    expect(businessName(DEFAULT_SETTINGS)).toBe("Ordix");
    expect(businessName({ ...DEFAULT_SETTINGS, business: { name: "Acme", logoUrl: null } })).toBe("Acme");
  });
});
