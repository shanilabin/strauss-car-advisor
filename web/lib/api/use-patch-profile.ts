"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { components } from "./schema";
import type { ApiErrorResponse, ConversationState } from "./use-conversation";

export type ProfilePatch = components["schemas"]["ProfilePatch"];

export class PatchProfileError extends Error {
  readonly status: number;
  readonly body: ApiErrorResponse;

  constructor(status: number, body: ApiErrorResponse) {
    super(body.error.message_he);
    this.name = "PatchProfileError";
    this.status = status;
    this.body = body;
  }
}

/** PATCH /v1/conversations/{id}/profile — apply server state, then invalidate. */
export function usePatchProfile(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: ProfilePatch): Promise<ConversationState> => {
      const { data, error, response } = await api.PATCH(
        "/v1/conversations/{conversation_id}/profile",
        {
          params: { path: { conversation_id: conversationId } },
          body: patch,
        },
      );
      if (error) {
        throw new PatchProfileError(response.status, error);
      }
      if (!data) {
        throw new Error("Empty profile patch response");
      }
      return data;
    },
    onSuccess: (state) => {
      queryClient.setQueryData<ConversationState>(["conversation", conversationId], state);
      void queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    },
  });
}
