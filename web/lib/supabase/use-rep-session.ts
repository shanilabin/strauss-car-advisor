"use client";

import type { Session, Subscription } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { getSupabase } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";
import type { SessionState } from "@/lib/supabase/use-session";

function isRepSession(session: Session | null): session is Session {
  return session?.user.app_metadata.role === "rep";
}

/**
 * The rep's session only — never signs in anonymously.
 * Missing session or a non-rep role both surface as session: null.
 */
export function useRepSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, loading: true, error: null });

  useEffect(() => {
    let active = true;
    let subscription: Subscription | undefined;

    const settle = (next: SessionState) => {
      if (active) setState(next);
    };

    try {
      const supabase = getSupabase("rep");

      subscription = supabase.auth.onAuthStateChange((_event, session) => {
        settle({
          session: isRepSession(session) ? session : null,
          loading: false,
          error: null,
        });
      }).data.subscription;

      void supabase.auth.getSession().then(({ data }) => {
        settle({
          session: isRepSession(data.session) ? data.session : null,
          loading: false,
          error: null,
        });
      });
    } catch (error) {
      console.error("Rep session check failed", error);
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
