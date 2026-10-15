"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { ApiErrorResponse } from "./use-conversation";
import type { components } from "./schema";

export type TurnResponse = components["schemas"]["TurnResponse"];

export class SendMessageError extends Error {
  readonly status: number;
  readonly body: ApiErrorResponse;

  constructor(status: number, body: ApiErrorResponse) {
    super(body.error.message_he);
    this.name = "SendMessageError";
    this.status = status;
    this.body = body;
  }
}

/** POST /v1/conversations/{id}/messages — then invalidate the conversation query. */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (text: string): Promise<TurnResponse> => {
      const { data, error, response } = await api.POST(
        "/v1/conversations/{conversation_id}/messages",
        {
          params: { path: { conversation_id: conversationId } },
          body: { text },
        },
      );
      if (error) {
        throw new SendMessageError(response.status, error);
      }
      if (!data) {
        throw new Error("Empty turn response");
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    },
  });
}
