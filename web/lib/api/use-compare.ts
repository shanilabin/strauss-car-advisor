"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { components } from "./schema";
import type { Comparison } from "./use-options";
import type { ApiErrorResponse, ConversationState } from "./use-conversation";

export type CompareRequest = components["schemas"]["CompareRequest"];

export class CompareError extends Error {
  readonly status: number;
  readonly body: ApiErrorResponse;

  constructor(status: number, body: ApiErrorResponse) {
    super(body.error.message_he);
    this.name = "CompareError";
    this.status = status;
    this.body = body;
  }
}

/** POST /v1/conversations/{id}/compare — today versus the chosen option ids. */
export function useCompare(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CompareRequest): Promise<Comparison> => {
      const { data, error, response } = await api.POST(
        "/v1/conversations/{conversation_id}/compare",
        {
          params: { path: { conversation_id: conversationId } },
          body,
        },
      );
      if (error) {
        throw new CompareError(response.status, error);
      }
      if (!data) {
        throw new Error("Empty compare response");
      }
      return data;
    },
    onSuccess: (comparison) => {
      queryClient.setQueryData<ConversationState>(["conversation", conversationId], (prev) =>
        prev
          ? {
              ...prev,
              latest_comparison: comparison,
              status: prev.status === "WAITING_REP" ? prev.status : "PRESENTED",
            }
          : prev,
      );
      void queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      void queryClient.invalidateQueries({
        queryKey: ["conversation", conversationId, "options"],
      });
    },
  });
}
