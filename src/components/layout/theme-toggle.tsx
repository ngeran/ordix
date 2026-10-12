"use client";

// ============================================================
// SECTION: Theme toggle
// ------------------------------------------------------------
// Toggles the `dark` class on <html> and persists the choice.
// The initial class is set pre-paint by the inline script in the
// root layout (no flash). Icon reflects the *current* theme.
// ============================================================

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  // Read after mount — SSR HTML has no theme knowledge.
  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("ordix-theme", next);
    } catch {
      // private mode — theme just won't persist
    }
    setTheme(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </Button>
  );
}

// Toggle writes the explicit choice; the bootstrap script defaults
// to dark when nothing is saved (see root layout themeInitScript).
