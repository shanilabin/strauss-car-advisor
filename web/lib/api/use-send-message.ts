"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { ApiErrorResponse, ConversationState } from "./use-conversation";
import type { components } from "./schema";

export type TurnResponse = components["schemas"]["TurnResponse"];

const SEND_FAILED: ApiErrorResponse = {
  error: {
    code: "request_failed",
    message_he: "שליחת ההודעה נכשלה. נסו שוב.",
  },
};

function isErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = value.error;
  if (typeof error !== "object" || error === null) return false;
  return (
    "code" in error &&
    typeof error.code === "string" &&
    "message_he" in error &&
    typeof error.message_he === "string"
  );
}

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

/** POST /v1/conversations/{id}/messages — cache the returned conversation state. */
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
        throw new SendMessageError(response.status, isErrorResponse(error) ? error : SEND_FAILED);
      }
      if (!data) {
        throw new SendMessageError(500, SEND_FAILED);
      }
      return data;
    },
    onSuccess: (turn) => {
      queryClient.setQueryData<ConversationState>(["conversation", conversationId], turn.state);
    },
  });
}
