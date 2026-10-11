"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";

// ============================================================
// SECTION: Login screen
// ------------------------------------------------------------
// Credentials form → NextAuth `signIn("credentials")`. On
// success we `router.replace` to the callbackUrl (the page the
// user was bounced from) and refresh so server components pick
// up the new session cookie.
// ============================================================

function LoginForm() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/order";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn("credentials", {
      redirect: false,
      email: email.trim().toLowerCase(),
      password,
    });

    if (result?.error) {
      setError(t("login.error"));
      setSubmitting(false);
      return;
    }

    router.replace(callbackUrl.startsWith("/") ? callbackUrl : "/order");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-sm p-6 sm:p-8">
      {/* Brand */}
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-on-primary"
        >
          O
        </span>
        <h1 className="text-2xl font-bold">{t("login.title")}</h1>
        <p className="text-sm text-on-surface-muted">{t("login.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label={t("login.email")} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(error)}
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
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-error-soft px-3 py-2 text-sm text-error" role="alert">
            {error}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          loading={submitting}
          className="w-full"
        >
          <LogIn className="h-5 w-5" />
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
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      {/* Suspense boundary: useSearchParams inside the form requires it
          during static prerendering of the page shell. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
