"use client";

import { useSyncExternalStore } from "react";

/**
 * Where the /form flow stands - kept in sessionStorage so a refresh returns to the same step and
 * comparison (QA B07). Per tab: a new tab starts from the employee picker. The numbers themselves are
 * never stored here: the conversation (and its latest comparison) is reloaded from the server by id.
 */
export type FormStage = "pick" | "profile" | "options" | "comparison";

export type FormFlowState = {
  conversationId: string | null;
  stage: FormStage;
  selectedId: string | null;
  pickedName: string | null;
};

const KEY = "strauss-form-flow";
const INITIAL: FormFlowState = { conversationId: null, stage: "pick", selectedId: null, pickedName: null };
const listeners = new Set<() => void>();
// The last written value, for browsers where sessionStorage throws
let memory: string | null = null;

function read(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null; // storage blocked: the flow simply isn't restored
  }
}

function parse(raw: string | null): FormFlowState {
  if (!raw) return INITIAL;
  try {
    const value = JSON.parse(raw) as Partial<FormFlowState>;
    // A step past "pick" needs a conversation to reload; without one, start over
    return value.conversationId ? { ...INITIAL, ...value } : INITIAL;
  } catch {
    return INITIAL;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Update part of the flow; several updates in one handler merge in order. */
export function updateFormFlow(patch: Partial<FormFlowState>): void {
  memory = JSON.stringify({ ...parse(read() ?? memory), ...patch });
  try {
    window.sessionStorage.setItem(KEY, memory);
  } catch {
    // storage blocked: the flow still works in this page, it just won't survive a refresh
  }
  listeners.forEach((listener) => listener());
}

export function useFormFlow(): FormFlowState {
  const raw = useSyncExternalStore(
    subscribe,
    () => read() ?? memory,
    () => null, // the server renders the picker; the client then restores the step
  );
  return parse(raw);
}
