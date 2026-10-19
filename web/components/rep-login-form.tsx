"use client";

import { isAuthApiError } from "@supabase/supabase-js";
import { CircleX, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";

const inputClass =
  "h-12 w-full min-w-0 rounded-xl border border-input bg-background px-4 text-base text-foreground focus-visible:border-primary aria-invalid:border-error";

export function RepLoginForm() {
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) {
      setError("הזינו אימייל וסיסמה.");
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError(null);

    try {
      const supabase = getSupabase("rep");
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      if (data.session?.user.app_metadata.role !== "rep") {
        await supabase.auth.signOut({ scope: "local" });
        throw new NotRepError();
      }

      // Stay busy until the navigation replaces this page, so the form cannot be sent twice.
      router.replace("/rep");
    } catch (failure) {
      setError(loginErrorMessage(failure));
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="rep-email" className="text-sm font-semibold">
          אימייל
        </label>
        <input
          id="rep-email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="username"
          required
          disabled={busy}
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? "rep-login-error" : undefined}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="rep-password" className="text-sm font-semibold">
          סיסמה
        </label>
        <input
          id="rep-password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          disabled={busy}
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? "rep-login-error" : undefined}
          className={inputClass}
        />
      </div>

      {error && (
        <p
          id="rep-login-error"
          role="alert"
          className="rounded-2xl flex items-start gap-2 border border-error-border bg-error-surface px-3 py-2.5 text-sm text-error"
        >
          <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={busy}>
        {busy && <LoaderCircle aria-hidden data-icon="inline-start" className="animate-spin" />}
        {busy ? "מתחברים…" : "כניסה"}
      </Button>
    </form>
  );
}

class NotRepError extends Error {}

function loginErrorMessage(error: unknown): string {
  if (error instanceof NotRepError) return "החשבון הזה לא מורשה להיכנס למסך הנציג.";
  if (isAuthApiError(error) && error.code === "invalid_credentials") return "האימייל או הסיסמה שגויים.";
  return authErrorMessage(error, "ההתחברות נכשלה. נסו שוב.");
}
