"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";

import {
  conversationQueryKey,
  type ConversationState,
} from "@/lib/api/use-conversation";
import { getSupabase } from "@/lib/supabase/client";
import { useSession } from "@/lib/supabase/use-session";

/** Refetch while waiting for the rep, in case Realtime does not get through - the answer shows within seconds. */
const WAITING_REP_POLL_MS = 4_000;

/**
 * Employee Realtime for one conversation.
 *
 * Events only mark the conversation query stale. The next GET /v1/conversations/{id}
 * is the source of truth — the raw payload is not applied to the UI.
 * The rep client must not use this hook: it listens to messages and conversations,
 * which RLS hides from reps.
 */
export function useConversationRealtime(conversationId: string) {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const status = useCachedConversationStatus(conversationId);

  useEffect(() => {
    if (!conversationId || !userId) return;

    let stopped = false;
    let channel: RealtimeChannel | undefined;
    const supabase = getSupabase("employee");
    const queryKey = conversationQueryKey(conversationId);

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey });
    };

    const start = async () => {
      const { data } = await supabase.auth.getSession();
      if (stopped) return;
      const token = data.session?.access_token;
      if (token) {
        await supabase.realtime.setAuth(token);
      }
      if (stopped) return;

      // supabase-js rejoins after a drop and reports SUBSCRIBED again.
      // Invalidate once on each (re)connect so a gap in the socket is filled from the API.
      channel = supabase
        .channel(`employee-conversation:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          () => {
            invalidate();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "rep_questions",
            filter: `conversation_id=eq.${conversationId}`,
          },
          () => {
            invalidate();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `id=eq.${conversationId}`,
          },
          () => {
            invalidate();
          },
        )
        .subscribe((next) => {
          if (next === "SUBSCRIBED") invalidate();
        });
    };

    void start().catch((error: unknown) => {
      console.error("Conversation realtime subscription failed", error);
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
  }, [conversationId, userId, queryClient]);

  useEffect(() => {
    if (!conversationId || status !== "WAITING_REP") return;
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({
        queryKey: conversationQueryKey(conversationId),
      });
    }, WAITING_REP_POLL_MS);
    return () => window.clearInterval(timer);
  }, [conversationId, status, queryClient]);
}

/** Reads status from the conversation query cache without issuing its own fetch. */
function useCachedConversationStatus(conversationId: string) {
  const queryClient = useQueryClient();
  const queryKey = conversationQueryKey(conversationId);

  return useSyncExternalStore(
    (onStoreChange) =>
      queryClient.getQueryCache().subscribe((event) => {
        const key = event.query.queryKey;
        if (key[0] === queryKey[0] && key[1] === queryKey[1]) onStoreChange();
      }),
    () => queryClient.getQueryData<ConversationState>(queryKey)?.status,
    () => undefined,
  );
}
