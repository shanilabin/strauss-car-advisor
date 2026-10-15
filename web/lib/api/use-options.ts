"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { components } from "./schema";
import type { ApiErrorResponse, ConversationState } from "./use-conversation";

export type Comparison = components["schemas"]["Comparison"];

export class OptionsFetchError extends Error {
  readonly status: number;
  readonly body: ApiErrorResponse;

  constructor(status: number, body: ApiErrorResponse) {
    super(body.error.message_he);
    this.name = "OptionsFetchError";
    this.status = status;
    this.body = body;
  }
}

/**
 * GET /v1/conversations/{id}/options — every alternative vs today.
 * The server also saves the comparison and may move status to PRESENTED;
 * we invalidate the conversation query so layout state stays in sync.
 */
export function useOptions(conversationId: string, enabled = true) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["conversation", conversationId, "options"] as const,
    enabled: enabled && conversationId.length > 0,
    queryFn: async (): Promise<Comparison> => {
      const { data, error, response } = await api.GET(
        "/v1/conversations/{conversation_id}/options",
        {
          params: { path: { conversation_id: conversationId } },
        },
      );
      if (error) {
        throw new OptionsFetchError(response.status, error);
      }
      if (!data) {
        throw new Error("Empty options response");
      }
      // Refresh conversation so status / latest_comparison match the server.
      void queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      queryClient.setQueryData<ConversationState>(["conversation", conversationId], (prev) =>
        prev
          ? {
              ...prev,
              latest_comparison: data,
              status:
                prev.status === "COLLECTING" || prev.status === "WAITING_REP"
                  ? prev.status
                  : "PRESENTED",
            }
          : prev,
      );
      return data;
    },
  });
}
