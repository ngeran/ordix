// ============================================================
// SECTION: Imports
// ============================================================

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/locale";
import { getAppSettings } from "@/lib/settings-server";
import { businessName, type AppSettings } from "@/lib/settings";
import { AppShell } from "@/components/layout/app-shell";
import { ToastViewport } from "@/components/ui/toast";
import "./globals.css";

// ============================================================
// SECTION: Brand font — Inter (Tactile Warehouse OS mockup)
// ------------------------------------------------------------
// Full Greek + Latin coverage (Jakarta had no Greek glyphs) with
// the tall x-height and unambiguous digits the warehouse floor
// needs at arm's length.
// ============================================================

const inter = Inter({
  subsets: ["latin", "greek"],
  variable: "--font-inter",
  display: "swap",
});

// ============================================================
// SECTION: Metadata & viewport (PWA installable)
// ============================================================

// Tab title follows the business name from Settings.
export async function generateMetadata(): Promise<Metadata> {
  const name = businessName(await getAppSettings());
  return {
    ...metadata,
    title: { default: `${name} — Orders & Inventory`, template: `%s · ${name}` },
  };
}

const metadata: Metadata = {
  description:
    "Ordix — order management and inventory for general and industrial products.",
  applicationName: "Ordix",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ordix",
  },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale: pinch-zoom stays available (accessibility —
  // Android honors maximum-scale and would block it). iOS focus-zoom
  // is avoided instead by keeping every text field ≥ 16px (the
  // Input/Select/Textarea primitives use text-base = 18px).
  interactiveWidget: "resizes-content",
  viewportFit: "cover", // safe-area aware on notched phones
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1116" },
  ],
};

// ============================================================
// SECTION: No-flash theme bootstrap
// ------------------------------------------------------------
// Runs before first paint: applies the saved theme and sidebar
// state, so neither flashes. Inline + blocking on purpose.
// ============================================================

// Settings → Theme can force one theme for everyone; the forced
// mode is baked into the script so it applies before paint too.
const themeInitScript = (settings: AppSettings) => `
(function () {
  try {
    var forced = ${JSON.stringify(settings.theme.mode === "user" ? null : settings.theme.mode)};
    var saved = forced || localStorage.getItem("ordix-theme");
    // Dark-first: the flagship Tactile Warehouse OS theme applies
    // unless the user explicitly chose light.
    if (saved === "dark" || !saved) {
      document.documentElement.classList.add("dark");
    }
    // Sidebar: saved choice, else collapsed to an icon rail on
    // tablets / small laptops so the page gets the space.
    var sidebar = localStorage.getItem("ordix-sidebar");
    if (sidebar === "collapsed" || (!sidebar && window.innerWidth < 1280)) {
      document.documentElement.dataset.sidebar = "collapsed";
    }
  } catch (e) {}
})();
`;

// ============================================================
// SECTION: Root layout
// ------------------------------------------------------------
// Server component: resolves the session once and hands the user
// to the client AppShell (nav, role gating) — no SessionProvider
// needed anywhere since we never use useSession().
// ============================================================

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [session, settings, cookieStore] = await Promise.all([
    auth(),
    getAppSettings(),
    cookies(),
  ]);
  const locale = resolveLocale(settings.language, cookieStore.get(LOCALE_COOKIE)?.value);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(settings) }} />
      </head>
      <body className={`${inter.variable} antialiased`} suppressHydrationWarning>
        <AppShell user={session?.user ?? null} settings={settings} locale={locale}>
          {children}
        </AppShell>
        <ToastViewport />
      </body>
    </html>
  );
}
