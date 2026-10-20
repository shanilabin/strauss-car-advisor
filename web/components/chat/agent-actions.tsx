"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/utils";

type TraceEvent = components["schemas"]["TraceEvent"];

/** What each step of the advisor did, in the employee's words. The technical name stays beside it. */
const TOOL_TEXT: Record<string, string> = {
  update_profile: "שמר את הפרטים שמסרת",
  find_vehicle: "חיפש את הרכב שלך במאגר רשות המסים",
  set_current_car: "שמר את הרכב שלך",
  list_options: "חישב את כל החלופות במנוע החישוב",
  compare: "חישב את ההשוואה במנוע החישוב",
  check_eligibility: "בדק זכאות לפי כללי רכב החברה",
  ask_representative: "שלח שאלה לנציג התחבורה",
  rep_answer: "החיל את תשובת נציג התחבורה",
};

type Step = { key: string; text: string; detail: string | null; tech: string; ok: boolean };

/** One line per step: a tool call with its outcome, the number check, the model that phrased the reply. */
function stepsOf(events: TraceEvent[]): Step[] {
  const steps: Step[] = [];
  events.forEach((event, index) => {
    const key = `${event.at}-${event.kind}-${event.name}-${index}`;
    const data = event.data ?? {};
    if (event.kind === "tool_call") {
      const result = events.slice(index + 1).find((e) => e.kind === "tool_result" && e.name === event.name);
      const retried = result?.data != null && "retry" in result.data;
      steps.push({
        key,
        text: TOOL_TEXT[event.name] ?? event.name,
        detail: retried ? "הכלי ביקש תיקון, והיועץ ניסה שוב" : null,
        tech: event.name,
        ok: !retried,
      });
    } else if (event.kind === "tool_result" && event.name === "rep_answer") {
      steps.push({ key, text: TOOL_TEXT.rep_answer, detail: null, tech: event.name, ok: true });
    } else if (event.kind === "guard") {
      const passed = data.passed === true;
      const detail = passed
        ? "כל מספר בתשובה הגיע מהמנוע או ממה שמסרת"
        : data.action === "retry"
          ? "נמצא מספר שלא הגיע מהמנוע, והיועץ התבקש לנסח מחדש בלי מספרים"
          : "התשובה הוחלפה בנוסח קבוע, כי היה בה מספר שלא אומת";
      steps.push({ key, text: "בדיקת אמינות למספרים", detail, tech: event.name, ok: passed });
    } else if (event.kind === "model") {
      if (event.name === "stuck") {
        steps.push({ key, text: "היועץ לא הצליח לנסח תשובה", detail: null, tech: event.name, ok: false });
        return;
      }
      const ms = typeof data.ms === "number" ? data.ms : null;
      steps.push({
        key,
        text: "ניסח את התשובה במילים",
        detail: ms != null ? `תוך ${(ms / 1000).toFixed(1)} שניות` : null,
        tech: event.name,
        ok: true,
      });
    }
  });
  return steps;
}

type AgentActionsProps = {
  trace: TraceEvent[] | undefined;
  messageId: string;
  onOpenChange?: (open: boolean) => void;
};

/**
 * "What the advisor did": one assistant message's server trace as plain steps - which tools ran, that
 * the engine (not the AI) calculated, and that every number passed the check. Hidden when empty.
 */
export function AgentActions({ trace, messageId, onOpenChange }: AgentActionsProps) {
  const events = trace ?? [];
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLOListElement>(null);
  // Opened at the bottom of the chat, the steps would sit below the fold - bring them into view
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);
  const reactId = useId();
  const panelId = `agent-actions-${messageId}-${reactId.replace(/:/g, "")}`;

  const steps = stepsOf(events);
  if (steps.length === 0) return null;

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
        מה היועץ עשה מאחורי הקלעים
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <ol
        ref={panelRef}
        id={panelId}
        className={cn(
          "mt-2 max-w-full min-w-0 rounded-2xl border border-border/70 bg-background px-4 py-1",
          !open && "hidden",
        )}
      >
        <li className="border-b border-border py-2 text-xs text-muted-foreground">
          ה-AI רק מנהל את השיחה. כל חישוב נעשה במנוע החישוב של החברה, וכל מספר בתשובה נבדק לפני שהוא מוצג.
        </li>
        {steps.map((step, index) => (
          <li key={step.key} className="flex min-w-0 gap-2 border-b border-border py-2 last:border-b-0">
            <span
              aria-hidden
              className={cn(
                "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold",
                step.ok ? "bg-success-surface text-success" : "bg-pending-surface text-pending",
              )}
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{step.text}</span>
              {step.detail && <span className="block text-xs text-muted-foreground">{step.detail}</span>}
              <bdi dir="ltr" className="block font-mono text-[0.68rem] break-all text-muted-foreground/70">
                {step.tech}
              </bdi>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
