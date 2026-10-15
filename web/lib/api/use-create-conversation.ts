"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { components } from "./schema";
import type { ApiErrorResponse, ConversationState } from "./use-conversation";

export type CreateConversationRequest = components["schemas"]["CreateConversationRequest"];

export class CreateConversationError extends Error {
  readonly status: number;
  readonly body: ApiErrorResponse;

  constructor(status: number, body: ApiErrorResponse) {
    super(body.error.message_he);
    this.name = "CreateConversationError";
    this.status = status;
    this.body = body;
  }
}

/** POST /v1/conversations — optionally pre-filled from a sample employee. */
export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateConversationRequest = {}): Promise<ConversationState> => {
      const { data, error, response } = await api.POST("/v1/conversations", { body });
      if (error) {
        throw new CreateConversationError(response.status, error);
      }
      if (!data) {
        throw new Error("Empty conversation response");
      }
      return data;
    },
    onSuccess: (state) => {
      queryClient.setQueryData<ConversationState>(["conversation", state.id], state);
    },
  });
}
