"use client";

import { isAuthApiError } from "@supabase/supabase-js";
import { CircleX, LoaderCircle, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";
import { useSession } from "@/lib/supabase/use-session";

const inputClass =
  "h-12 w-full min-w-0 rounded-xl border border-input bg-background px-4 text-base text-foreground focus-visible:border-primary aria-invalid:border-error";

/** Where to go after signing in: a page of this site only (never an outside address). */
function nextPath(): string {
  if (typeof window === "undefined") return "/c/new";
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/c/new";
}

/**
 * Employee sign-in: Google (the first name comes from the account and makes the chat personal) or
 * email and password, with sign-up. The transport rep signs in on their own screen.
 */
export function EmployeeLogin() {
  const router = useRouter();
  const { session, loading } = useSession();
  const submitting = useRef(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  // Signed in already (or just back from Google): continue where they were heading
  useEffect(() => {
    if (session) router.replace(nextPath());
  }, [session, router]);

  // Next keeps this page alive but hidden after the redirect: unlock it for the next visit
  useEffect(
    () => () => {
      submitting.current = false;
      setBusy(null);
    },
    [],
  );

  async function withGoogle() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy("google");
    setError(null);
    const redirectTo = `${window.location.origin}/login?next=${encodeURIComponent(nextPath())}`;
    const { error: failure } = await getSupabase("employee").auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (failure) {
      setError(loginErrorMessage(failure));
      submitting.current = false;
      setBusy(null);
    }
    // on success the browser is on its way to Google
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const firstName = String(form.get("first_name") ?? "").trim();
    if (!email || !password) {
      setError("הזינו אימייל וסיסמה.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("הסיסמה צריכה להיות באורך 6 תווים לפחות.");
      return;
    }

    submitting.current = true;
    setBusy("email");
    setError(null);
    try {
      const auth = getSupabase("employee").auth;
      if (mode === "signin") {
        const { error: failure } = await auth.signInWithPassword({ email, password });
        if (failure) throw failure;
      } else {
        const { data, error: failure } = await auth.signUp({
          email,
          password,
          options: { data: firstName ? { first_name: firstName } : {} },
        });
        if (failure) throw failure;
        if (!data.session) {
          setCheckEmail(true); // the project asks to confirm the email first
          submitting.current = false;
          setBusy(null);
          return;
        }
      }
      // the session effect above navigates; stay busy until it does
    } catch (failure) {
      setError(loginErrorMessage(failure));
      submitting.current = false;
      setBusy(null);
    }
  }

  if (checkEmail) {
    return (
      <p role="status" className="flex items-start gap-3 rounded-2xl bg-success-surface px-4 py-4 text-sm text-success">
        <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
        <span>שלחנו לך מייל לאישור החשבון. אחרי שתאשרו אותו, חזרו לכאן והתחברו.</span>
      </p>
    );
  }

  const disabled = loading || busy !== null;
  return (
    <div className="flex flex-col gap-6">
      <Button type="button" variant="outline" size="lg" onClick={() => void withGoogle()} disabled={disabled} className="gap-3">
        {busy === "google" ? (
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
        ) : (
          <GoogleMark />
        )}
        {busy === "google" ? "מעבירים ל-Google…" : "התחברות עם Google"}
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        או עם אימייל
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} noValidate aria-busy={busy === "email"} className="flex flex-col gap-4">
        {mode === "signup" && (
          <div className="flex flex-col gap-2">
            <label htmlFor="login-first-name" className="text-sm font-semibold">
              שם פרטי <span className="font-normal text-muted-foreground">(כדי שהיועץ יפנה אליך בשם)</span>
            </label>
            <input id="login-first-name" name="first_name" autoComplete="given-name" maxLength={30} disabled={disabled} className={inputClass} />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="login-email" className="text-sm font-semibold">
            אימייל
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="username"
            required
            disabled={disabled}
            aria-invalid={error !== null || undefined}
            aria-describedby={error ? "login-error" : undefined}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="login-password" className="text-sm font-semibold">
            סיסמה
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            dir="ltr"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            disabled={disabled}
            aria-invalid={error !== null || undefined}
            aria-describedby={error ? "login-error" : undefined}
            className={inputClass}
          />
        </div>

        {error && (
          <p id="login-error" role="alert" className="flex items-start gap-2 rounded-2xl border border-error-border bg-error-surface px-3 py-2.5 text-sm text-error">
            <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={disabled}>
          {busy === "email" && <LoaderCircle aria-hidden data-icon="inline-start" className="animate-spin" />}
          {busy === "email" ? "רגע…" : mode === "signin" ? "כניסה" : "יצירת חשבון"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "signin" ? "עוד אין לך חשבון? " : "כבר יש לך חשבון? "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          className="font-bold text-link underline underline-offset-4"
        >
          {mode === "signin" ? "הרשמה" : "כניסה"}
        </button>
      </p>
      <p className="text-center text-xs text-muted-foreground">
        נציג/ת תחבורה?{" "}
        <Link href="/rep/login" className="font-semibold text-link underline underline-offset-4">
          כניסת נציג
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">
        בהתחברות את/ה מסכים/ה ל
        <Link href="/privacy" className="font-semibold text-link underline underline-offset-4">
          מדיניות הפרטיות
        </Link>
        .
      </p>
    </div>
  );
}

/** Google's "G", drawn inline (no external image). */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function loginErrorMessage(error: unknown): string {
  if (isAuthApiError(error)) {
    if (error.code === "invalid_credentials") return "האימייל או הסיסמה שגויים.";
    if (error.code === "user_already_exists" || error.code === "email_exists")
      return "כבר יש חשבון עם המייל הזה. אפשר להתחבר.";
    if (error.code === "email_not_confirmed") return "צריך לאשר קודם את המייל שקיבלת.";
    if (error.code === "validation_failed" && /provider/i.test(error.message))
      return "ההתחברות עם Google עוד לא הופעלה. אפשר להתחבר עם אימייל וסיסמה.";
  }
  return authErrorMessage(error, "ההתחברות נכשלה. נסו שוב.");
}
