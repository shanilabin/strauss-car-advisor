"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "./client";
import type { components } from "./schema";

export type ConversationState = components["schemas"]["ConversationState"];
export type ApiErrorResponse = components["schemas"]["ErrorResponse"];

export class ConversationFetchError extends Error {
  readonly status: number;
  readonly body: ApiErrorResponse;

  constructor(status: number, body: ApiErrorResponse) {
    super(body.error.message_he);
    this.name = "ConversationFetchError";
    this.status = status;
    this.body = body;
  }
}

/** Cache key for GET /v1/conversations/{id}. */
export function conversationQueryKey(id: string) {
  return ["conversation", id] as const;
}

/** GET /v1/conversations/{id} — typed data and typed ErrorResponse on failure. */
export function useConversation(id: string) {
  return useQuery({
    queryKey: conversationQueryKey(id),
    enabled: id.length > 0,
    queryFn: async (): Promise<ConversationState> => {
      const { data, error, response } = await api.GET("/v1/conversations/{conversation_id}", {
        params: { path: { conversation_id: id } },
      });
      if (error) {
        throw new ConversationFetchError(response.status, error);
      }
      if (!data) {
        throw new Error("Empty conversation response");
      }
      return data;
    },
  });
}
