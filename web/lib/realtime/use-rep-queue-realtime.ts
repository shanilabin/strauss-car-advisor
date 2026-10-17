"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { REP_QUESTIONS_QUERY_KEY } from "@/lib/api/use-rep-questions";
import { getSupabase } from "@/lib/supabase/client";
import { useRepSession } from "@/lib/supabase/use-rep-session";

/**
 * Rep-queue Realtime. Listens only to `rep_questions` INSERT/UPDATE on the rep
 * Supabase client (separate storage key). Never subscribes to `conversations`
 * or `messages`. Events invalidate the open-queue query; the API response stays
 * the source of truth. Polling in `useRepQuestions` remains the fallback.
 */
export function useRepQueueRealtime(enabled: boolean) {
  const queryClient = useQueryClient();
  const { session } = useRepSession();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!enabled || !userId) return;

    let stopped = false;
    let channel: RealtimeChannel | undefined;
    const supabase = getSupabase("rep");

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: REP_QUESTIONS_QUERY_KEY });
    };

    const start = async () => {
      const { data } = await supabase.auth.getSession();
      if (stopped) return;
      const token = data.session?.access_token;
      if (token) {
        await supabase.realtime.setAuth(token);
      }
      if (stopped) return;

      channel = supabase
        .channel("rep-questions")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "rep_questions" },
          () => {
            invalidate();
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rep_questions" },
          () => {
            invalidate();
          },
        )
        .subscribe((next) => {
          if (next === "SUBSCRIBED") invalidate();
        });
    };

    void start().catch((error: unknown) => {
      console.error("Rep queue realtime subscription failed", error);
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") invalidate();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, userId, queryClient]);
}
