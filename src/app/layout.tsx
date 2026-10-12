// ============================================================
// SECTION: Imports
// ============================================================

import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ToastViewport } from "@/components/ui/toast";
import "./globals.css";

// ============================================================
// SECTION: Brand font — Plus Jakarta Sans (Tactile Warehouse OS)
// ------------------------------------------------------------
// Wide apertures and clean stroke distinctions keep 0/O and 1/l
// unambiguous on warehouse tablets and handheld scanners.
// ============================================================

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

// ============================================================
// SECTION: Metadata & viewport (PWA installable)
// ============================================================

export const metadata: Metadata = {
  title: {
    default: "Ordix — Orders & Inventory",
    template: "%s · Ordix",
  },
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
  viewportFit: "cover", // safe-area aware on notched phones
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1116" },
  ],
};

// ============================================================
// SECTION: No-flash theme bootstrap
// ------------------------------------------------------------
// Runs before first paint: applies the saved theme, else falls
// back to the OS preference. Inline + blocking on purpose.
// ============================================================

const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem("ordix-theme");
    // Dark-first: the flagship Tactile Warehouse OS theme applies
    // unless the user explicitly chose light.
    if (saved === "dark" || !saved) {
      document.documentElement.classList.add("dark");
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
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${jakarta.variable} antialiased`}>
        <AppShell user={session?.user ?? null}>{children}</AppShell>
        <ToastViewport />
      </body>
    </html>
  );
}
