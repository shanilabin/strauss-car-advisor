"use client";

import type { Session, Subscription } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { getSupabase } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";

export type SessionState = { session: Session | null; loading: boolean; error: string | null };

/** A real sign-in (Google or email). The anonymous sessions of the demo era no longer count. */
function signedIn(session: Session | null): Session | null {
  return session && !session.user.is_anonymous ? session : null;
}

/**
 * The employee's session - an internal company system, so it is a real sign-in (Google or email and
 * password), never anonymous. `session: null` means signed out (the gate sends them to /login).
 * Employee area only (/, /c/*, /form, /login); the rep keeps a separate session under /rep.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, loading: true, error: null });

  useEffect(() => {
    let active = true;
    let subscription: Subscription | undefined;
    const settle = (next: SessionState) => {
      if (active) setState(next);
    };

    try {
      const supabase = getSupabase("employee");
      subscription = supabase.auth.onAuthStateChange((_event, session) => {
        settle({ session: signedIn(session), loading: false, error: null });
      }).data.subscription;

      void supabase.auth.getSession().then(async ({ data }) => {
        if (data.session?.user.is_anonymous) {
          // an anonymous session from before sign-in was required: drop it, the API refuses it anyway
          await supabase.auth.signOut({ scope: "local" });
        }
        settle({ session: signedIn(data.session), loading: false, error: null });
      });
    } catch (error) {
      console.error("Session check failed", error);
      settle({
        session: null,
        loading: false,
        error: authErrorMessage(error, "לא הצלחנו לבדוק את ההתחברות. רעננו את הדף."),
      });
    }

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  return state;
}

/** The name to greet: the account's first name (Google's given name, or what was typed at sign-up). */
export function displayName(session: Session | null): string | null {
  const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  for (const key of ["given_name", "first_name", "full_name", "name"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim().split(/\s+/)[0] ?? null;
  }
  return session?.user.email?.split("@")[0] ?? null;
}
