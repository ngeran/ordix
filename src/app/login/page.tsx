"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { businessName } from "@/lib/settings";
import { useAppSettings } from "@/stores/settings-store";
import { BrandMark } from "@/components/layout/app-shell";

// ============================================================
// SECTION: Login screen
// ------------------------------------------------------------
// Credentials form → NextAuth `signIn("credentials")`. On
// success everyone lands on the Home launcher (by design, not the
// page they were bounced from) and we refresh so server components
// pick up the new session cookie.
// ============================================================

function LoginForm() {
  const t = useT();
  const router = useRouter();

  const settings = useAppSettings();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn("credentials", {
      redirect: false,
      username: username.trim().toLowerCase(),
      password,
    });

    if (result?.error) {
      setError(t("login.error"));
      setSubmitting(false);
      return;
    }

    router.replace("/home");
    router.refresh();
  };

  return (
    <Card className="m-auto w-full max-w-sm p-6 short:p-5 sm:p-8">
      {/* Brand */}
      <div className="mb-6 flex flex-col items-center gap-2 text-center short:mb-4">
        <BrandMark
          name={businessName(settings)}
          logoUrl={settings.business.logoUrl}
          className="h-14 w-14 rounded-2xl text-2xl"
        />
        {settings.business.name && (
          <p className="text-sm font-semibold text-on-surface-muted">{settings.business.name}</p>
        )}
        <h1 className="text-2xl font-bold">{t("login.title")}</h1>
        <p className="text-sm text-on-surface-muted">{t("login.subtitle")}</p>
      </div>

      {/* method="post": a submit before hydration must never put the
          password into the URL (GET is the browser default). */}
      <form method="post" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label={t("login.username")} htmlFor="username">
          <Input
            id="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-invalid={Boolean(error)}
            className="h-14 text-lg"
          />
        </Field>

        <Field label={t("login.password")} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(error)}
            className="h-14 text-lg"
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-error-soft px-3 py-2 text-sm text-error" role="alert">
            {error}
          </p>
        )}

        <Button
          type="submit"
          size="xl"
          loading={submitting}
          className="w-full text-lg"
        >
          <LogIn className="h-6 w-6" />
          {t("login.submit")}
        </Button>
      </form>

      {/* Seeded demo accounts — dev convenience, documented in README */}
      <div className="mt-6 rounded-xl bg-surface-container-low px-4 py-3 text-xs text-on-surface-muted">
        <p className="font-medium">{t("login.demoHint")}</p>
        <p className="mt-1 font-mono">{t("login.demoAdmin")}</p>
        <p className="font-mono">{t("login.demoStaff")}</p>
      </div>
    </Card>
  );
}

export default function LoginPage() {
  return (
    // m-auto centering (not items-center): a card taller than the
    // screen — phone landscape, Android with the keyboard up — stays
    // fully scrollable instead of being cut off at the top.
    <div className="flex h-app overflow-y-auto bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <LoginForm />
    </div>
  );
}
