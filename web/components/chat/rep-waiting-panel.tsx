import { Clock } from "lucide-react";
import Image from "next/image";

import type { components } from "@/lib/api/schema";
import { formatDateTime } from "@/lib/format";

type RepQuestionOut = components["schemas"]["RepQuestionOut"];
type MissingField = components["schemas"]["MissingField"];

type RepWaitingPanelProps = {
  questions: readonly RepQuestionOut[];
  /** Conversation-level gaps whose Hebrew question comes from the DTO. */
  missing?: readonly MissingField[];
};

/**
 * Calm "waiting for the rep" card: what was asked and when, from the DTOs.
 * No countdown and no invented arrival time.
 */
export function RepWaitingPanel({ questions, missing = [] }: RepWaitingPanelProps) {
  const asked = new Set(questions.map((question) => question.question));
  const extraMissing = missing.filter(
    (item) => item.ask === "rep" && !asked.has(item.question),
  );

  return (
    <section
      role="status"
      className="flex items-start gap-4 rounded-3xl border border-pending-border bg-pending-surface px-5 py-4 text-sm shadow-soft"
    >
      <Image src="/brand/mascot-loading.webp" alt="" width={359} height={360} className="h-auto w-16 shrink-0" />
      <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2 font-bold text-foreground">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-pending motion-safe:animate-pulse"
        />
        <Clock aria-hidden className="size-4 text-pending" />
        ממתין לנציג
      </p>

      {questions.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {questions.map((question) => (
            <li key={question.id}>
              <p className="text-foreground">{question.question}</p>
              <time
                dateTime={question.created_at}
                className="mt-0.5 block text-xs text-muted-foreground tabular-nums"
              >
                נשאל ב-{formatDateTime(question.created_at)}
              </time>
            </li>
          ))}
        </ul>
      )}

      {extraMissing.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-foreground">
          {extraMissing.map((item) => (
            <li key={item.field}>{item.question}</li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}
