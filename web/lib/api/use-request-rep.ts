"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { ConversationState } from "./use-conversation";

export class RequestRepError extends Error {}

/** POST /v1/conversations/{id}/rep-requests - "I want this car": the rep confirms its participation. */
export function useRequestRep(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (optionId: string): Promise<ConversationState> => {
      const { data, error } = await api.POST("/v1/conversations/{conversation_id}/rep-requests", {
        params: { path: { conversation_id: conversationId } },
        body: { option_id: optionId },
      });
      if (error) throw new RequestRepError(error.error.message_he);
      if (!data) throw new RequestRepError("שליחת הבקשה לנציג נכשלה. נסו שוב.");
      return data;
    },
    onSuccess: (state) => {
      queryClient.setQueryData<ConversationState>(["conversation", conversationId], state);
      void queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    },
  });
}
