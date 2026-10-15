import type { SendMessageError } from "./use-send-message";

/**
 * True when the chat API signals form-mode fallback (ARCHITECTURE: 503 {mode:"form"}).
 * Checks ErrorBody.details.mode — A4.2 will emit this when every LLM fails.
 */
export function isFormModeFallback(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (!("status" in error) || !("body" in error)) return false;
  const status = (error as SendMessageError).status;
  if (status !== 503) return false;
  const details = (error as SendMessageError).body?.error?.details;
  if (details == null || typeof details !== "object") return false;
  return (details as { mode?: unknown }).mode === "form";
}
