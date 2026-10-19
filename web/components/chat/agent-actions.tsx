"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/utils";

type TraceEvent = components["schemas"]["TraceEvent"];

const HEBREW = /[\u0590-\u05FF]/;

/** Short Hebrew status for the event kind. Not a description of what the tool did. */
const KIND_STATUS: Record<TraceEvent["kind"], string> = {
  tool_call: "קריאה",
  tool_result: "תוצאה",
  guard: "בדיקה",
  model: "מודל",
};

function stringField(data: TraceEvent["data"], key: string): string | null {
  if (!data) return null;
  const value = data[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A Hebrew label only when the event payload itself carries one. */
function hebrewLabel(data: TraceEvent["data"]): string | null {
  for (const key of ["label", "label_he", "title"]) {
    const value = stringField(data, key);
    if (value && HEBREW.test(value)) return value;
  }
  return null;
}

/**
 * Status from the DTO: an explicit status string, a guard pass/fail, otherwise the kind.
 * Numeric payload fields and raw data are never rendered.
 */
function statusText(event: TraceEvent): string {
  const explicit = stringField(event.data, "status");
  if (explicit) return explicit;
  const kind = KIND_STATUS[event.kind];
  const passed = event.data?.passed;
  if (typeof passed === "boolean") {
    return `${kind} · ${passed ? "עבר" : "לא עבר"}`;
  }
  return kind;
}

type AgentActionsProps = {
  trace: TraceEvent[] | undefined;
  messageId: string;
  onOpenChange?: (open: boolean) => void;
};

/** Collapsed timeline of one assistant message's server trace. Hidden when the trace is empty. */
export function AgentActions({ trace, messageId, onOpenChange }: AgentActionsProps) {
  const events = trace ?? [];
  const [open, setOpen] = useState(false);
  const reactId = useId();
  const panelId = `agent-actions-${messageId}-${reactId.replace(/:/g, "")}`;

  if (events.length === 0) return null;

  function toggle() {
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
  }

  return (
    <div className="mt-2 max-w-full min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-xs font-semibold text-muted-foreground shadow-soft hover:border-primary hover:text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11"
      >
        הצג פעולות AI
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <ol
        id={panelId}
        className={cn(
          "mt-2 max-w-full min-w-0 rounded-2xl border border-border/70 bg-background px-4 py-1",
          !open && "hidden",
        )}
      >
        {events.map((event, index) => {
          const label = hebrewLabel(event.data);
          return (
            <li
              key={`${event.at}-${event.kind}-${event.name}-${index}`}
              className="min-w-0 border-b border-border py-2 last:border-b-0"
            >
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span className="font-semibold text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="min-w-0 font-semibold break-all">
                  <bdi dir="ltr">{event.name}</bdi>
                </span>
                <span className="text-muted-foreground">{statusText(event)}</span>
              </p>
              {label ? <p className="mt-0.5 text-sm break-words">{label}</p> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
