"use client";

import type { Session, Subscription, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { getSupabase } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";

export type SessionState = { session: Session | null; loading: boolean; error: string | null };

let pending: Promise<Session> | null = null;

/** Shared in-flight call, so Strict Mode or several callers never create two anonymous users. */
function ensureSession(supabase: SupabaseClient): Promise<Session> {
  pending ??= (async () => {
    const { data: current } = await supabase.auth.getSession();
    if (current.session) return current.session;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (!data.session) throw new Error("signInAnonymously returned no session");
    return data.session;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

/**
 * The employee's session: reuses the stored one or signs in anonymously.
 * Employee area only (/ and /c/*) - on /rep it would turn the rep into an anonymous user.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, loading: true, error: null });

  useEffect(() => {
    let active = true;
    let subscription: Subscription | undefined;

    const settle = (next: SessionState) => {
      if (active) setState(next);
    };

    const connect = async () => {
      if (!active) return;
      try {
        const supabase = getSupabase("employee");
        subscription ??= supabase.auth.onAuthStateChange((event, session) => {
          if (event === "SIGNED_OUT") {
            settle({ session: null, loading: true, error: null });
            // Supabase calls inside this callback can deadlock the auth lock; run after it returns.
            setTimeout(() => void connect(), 0);
          } else if (session) {
            settle({ session, loading: false, error: null });
          }
        }).data.subscription;

        settle({ session: await ensureSession(supabase), loading: false, error: null });
      } catch (error) {
        console.error("Anonymous sign-in failed", error);
        settle({
          session: null,
          loading: false,
          error: authErrorMessage(error, "לא הצלחנו להתחבר. רעננו את הדף ונסו שוב."),
        });
      }
    };

    void connect();
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  return state;
}
