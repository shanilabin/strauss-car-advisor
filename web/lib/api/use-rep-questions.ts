"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { repApi } from "./client";
import type { components } from "./schema";
import type { ApiErrorResponse } from "./use-conversation";

export type RepQuestionOut = components["schemas"]["RepQuestionOut"];
export type RepAnswerRequest = components["schemas"]["RepAnswerRequest"];

export const REP_QUESTIONS_QUERY_KEY = ["rep", "questions", "OPEN"] as const;

/** Polling fallback for the open queue. Realtime invalidates the same query. */
export const REP_QUEUE_POLL_MS = 5_000;

export class RepQuestionsFetchError extends Error {
  readonly status: number;
  readonly body: ApiErrorResponse;

  constructor(status: number, body: ApiErrorResponse) {
    super(body.error.message_he);
    this.name = "RepQuestionsFetchError";
    this.status = status;
    this.body = body;
  }
}

export class RepAnswerError extends Error {
  readonly status: number;
  readonly body: ApiErrorResponse;

  constructor(status: number, body: ApiErrorResponse) {
    super(body.error.message_he);
    this.name = "RepAnswerError";
    this.status = status;
    this.body = body;
  }
}

/** GET /v1/rep/questions?status=OPEN — polled as a fallback while Realtime is connected. */
export function useRepQuestions(enabled: boolean) {
  return useQuery({
    queryKey: REP_QUESTIONS_QUERY_KEY,
    enabled,
    refetchInterval: REP_QUEUE_POLL_MS,
    queryFn: async (): Promise<RepQuestionOut[]> => {
      const { data, error, response } = await repApi.GET("/v1/rep/questions", {
        params: { query: { status: "OPEN" } },
      });
      if (error) {
        throw new RepQuestionsFetchError(response.status, error);
      }
      if (!data) {
        throw new Error("Empty rep questions response");
      }
      return data;
    },
  });
}

/** POST /v1/rep/questions/{id}/answer — then refresh the open queue. */
export function useAnswerRepQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      questionId,
      body,
    }: {
      questionId: string;
      body: RepAnswerRequest;
    }): Promise<RepQuestionOut> => {
      const { data, error, response } = await repApi.POST("/v1/rep/questions/{question_id}/answer", {
        params: { path: { question_id: questionId } },
        body,
      });
      if (error) {
        throw new RepAnswerError(response.status, error);
      }
      if (!data) {
        throw new Error("Empty rep answer response");
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REP_QUESTIONS_QUERY_KEY });
    },
  });
}
