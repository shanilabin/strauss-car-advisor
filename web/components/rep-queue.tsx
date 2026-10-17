"use client";

import { CircleX, LoaderCircle } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  RepAnswerError,
  RepQuestionsFetchError,
  useAnswerRepQuestion,
  useRepQuestions,
  type RepQuestionOut,
} from "@/lib/api/use-rep-questions";
import { useRepQueueRealtime } from "@/lib/realtime/use-rep-queue-realtime";
import { cn } from "@/lib/utils";

/** Hebrew labels for the minimal context keys the DTO may include. Unknown keys fall back to the key. */
const CONTEXT_LABELS: Record<string, string> = {
  occupation: "עיסוק",
  group: "קבוצה",
  requested_car: "רכב מבוקש",
  current_car: "רכב נוכחי",
};

const timeFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
});

type RepQueueProps = {
  /** When false, the query stays idle (e.g. while auth is still resolving). */
  enabled?: boolean;
};

export function RepQueue({ enabled = true }: RepQueueProps) {
  useRepQueueRealtime(enabled);
  const query = useRepQuestions(enabled);
  const questions = useMemo(() => {
    const list = query.data ?? [];
    return [...list].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [query.data]);

  const [userSelectedId, setUserSelectedId] = useState<string | null>(null);
  const selected =
    questions.find((q) => q.id === userSelectedId) ?? questions[0] ?? null;

  const prevCount = useRef<number | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  useEffect(() => {
    if (!query.isSuccess) return;
    const count = questions.length;
    if (prevCount.current !== null && count > prevCount.current) {
      setLiveMessage(count - prevCount.current === 1 ? "שאלה חדשה נוספה לתור" : "שאלות חדשות נוספו לתור");
    }
    prevCount.current = count;
  }, [query.isSuccess, questions.length]);

  if (query.isPending && !query.data) {
    return (
      <div className="flex flex-1 items-center justify-center px-5 py-16 text-muted-foreground">
        טוען את התור…
      </div>
    );
  }

  if (query.isError) {
    const message =
      query.error instanceof RepQuestionsFetchError
        ? query.error.message
        : "לא הצלחנו לטעון את תור השאלות.";
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 px-5 py-16">
        <p role="alert" className="border border-error-border bg-error-surface px-3 py-2.5 text-sm text-error">
          {message}
        </p>
        <Button type="button" variant="outline" onClick={() => void query.refetch()}>
          נסו שוב
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-4 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl lg:text-4xl">תור הנציג</h1>
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {questions.length === 0
            ? "אין שאלות פתוחות"
            : questions.length === 1
              ? "שאלה אחת פתוחה"
              : `${questions.length} שאלות פתוחות`}
        </p>
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      {questions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center border border-border bg-surface px-5 py-16 text-center">
          <p className="text-lg font-semibold">אין שאלות פתוחות כרגע</p>
          <p className="mt-2 text-sm text-muted-foreground">שאלות חדשות יופיעו כאן אוטומטית.</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
          <QuestionList
            questions={questions}
            selectedId={selected?.id ?? null}
            onSelect={setUserSelectedId}
          />
          {selected && <QuestionPanel key={selected.id} question={selected} />}
        </div>
      )}
    </div>
  );
}

function QuestionList({
  questions,
  selectedId,
  onSelect,
}: {
  questions: RepQuestionOut[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="שאלות פתוחות" className="border border-border bg-surface">
      <ul className="divide-y divide-border">
        {questions.map((question) => {
          const selected = question.id === selectedId;
          const summary = contextSummary(question.context);
          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onSelect(question.id)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex w-full flex-col gap-1 px-4 py-3 text-start transition-colors",
                  "hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring",
                  selected && "border-s-4 border-primary bg-info-surface",
                )}
              >
                <span className="line-clamp-2 text-sm font-semibold">{question.question}</span>
                {summary && (
                  <span className="line-clamp-1 text-xs text-muted-foreground">{summary}</span>
                )}
                <time
                  dateTime={question.created_at}
                  className="text-xs text-muted-foreground tabular-nums"
                >
                  {timeFormatter.format(new Date(question.created_at))}
                </time>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function QuestionPanel({ question }: { question: RepQuestionOut }) {
  const contextEntries = Object.entries(question.context ?? {});

  return (
    <section
      aria-labelledby={`rep-question-${question.id}`}
      className="flex flex-col gap-6 border border-border bg-surface p-5 lg:p-6"
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-muted-foreground">שאלה פתוחה</p>
        <h2 id={`rep-question-${question.id}`} className="text-xl font-semibold leading-snug">
          {question.question}
        </h2>
        <time dateTime={question.created_at} className="text-sm text-muted-foreground tabular-nums">
          נפתחה ב-{timeFormatter.format(new Date(question.created_at))}
        </time>
      </div>

      {contextEntries.length > 0 && (
        <dl className="grid gap-3 border-y border-border py-4 sm:grid-cols-2">
          {contextEntries.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5">
              <dt className="text-xs font-semibold text-muted-foreground">
                {CONTEXT_LABELS[key] ?? key}
              </dt>
              <dd className="text-sm">
                <bdi>{value}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <AnswerForm questionId={question.id} />
    </section>
  );
}

function AnswerForm({ questionId }: { questionId: string }) {
  const formId = useId();
  const valueId = `${formId}-value`;
  const dateId = `${formId}-effective-from`;
  const errorId = `${formId}-error`;

  const answer = useAnswerRepQuestion();
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = locked;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;

    const form = new FormData(event.currentTarget);
    const value = String(form.get("value") ?? "").trim();
    const effectiveFromRaw = String(form.get("effective_from") ?? "").trim();

    if (!value) {
      setError("הזינו תשובה לפני השליחה.");
      return;
    }

    setLocked(true);
    setError(null);

    answer.mutate(
      {
        questionId,
        body: {
          value,
          effective_from: effectiveFromRaw.length > 0 ? effectiveFromRaw : null,
        },
      },
      {
        onError: (failure) => {
          setLocked(false);
          setError(
            failure instanceof RepAnswerError
              ? failure.message
              : "שליחת התשובה נכשלה. אפשר לנסות שוב.",
          );
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={answer.isPending} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={valueId} className="text-sm font-semibold">
          תשובה
        </label>
        <input
          id={valueId}
          name="value"
          type="text"
          required
          maxLength={500}
          disabled={disabled}
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder="לדוגמה: 350"
          className="h-11 w-full border border-input bg-surface px-3 text-base text-foreground aria-invalid:border-error"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={dateId} className="text-sm font-semibold">
          בתוקף מ־ <span className="font-normal text-muted-foreground">(אופציונלי)</span>
        </label>
        <input
          id={dateId}
          name="effective_from"
          type="date"
          disabled={disabled}
          dir="ltr"
          className="h-11 w-full max-w-xs border border-input bg-surface px-3 text-base text-foreground"
        />
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-2 border border-error-border bg-error-surface px-3 py-2.5 text-sm text-error"
        >
          <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={disabled}>
          {answer.isPending && (
            <LoaderCircle aria-hidden data-icon="inline-start" className="animate-spin" />
          )}
          {locked && !answer.isPending ? "נשלח" : answer.isPending ? "שולחים…" : "שלח"}
        </Button>
        {locked && !answer.isPending && !error && (
          <p className="text-sm text-success" role="status">
            התשובה נשלחה בהצלחה.
          </p>
        )}
      </div>
    </form>
  );
}

function contextSummary(context: RepQuestionOut["context"]): string | null {
  if (!context) return null;
  const parts = ["occupation", "group", "requested_car"]
    .map((key) => context[key])
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" · ") : null;
}
