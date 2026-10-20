"use client";

import {
  CircleX,
  Clock,
  History,
  LoaderCircle,
  type LucideIcon,
  MessagesSquare,
  PencilLine,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { useOccupations } from "@/lib/api/use-config";
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
        <p role="alert" className="rounded-2xl border border-error-border bg-error-surface px-3 py-2.5 text-sm text-error">
          {message}
        </p>
        <Button type="button" variant="outline" onClick={() => void query.refetch()}>
          נסו שוב
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-screen-2xl flex-1 flex-col gap-5 overflow-x-clip px-4 py-6 lg:px-8">
      <header className="relative isolate flex min-h-28 items-center gap-4 overflow-hidden rounded-3xl px-6 py-5 shadow-card lg:min-h-32 lg:px-8">
        <Image
          src="/brand/bg-flowing-arcs.webp"
          alt=""
          fill
          sizes="100vw"
          className="-z-10 object-cover object-[50%_35%] dark:opacity-30"
        />
        <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-l from-surface/95 via-surface/80 to-surface/20" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl lg:text-4xl">תור הנציג</h1>
          <p className="mt-1 text-sm text-foreground/80" aria-live="polite">
            {questions.length === 0
              ? "אין שאלות פתוחות"
              : questions.length === 1
                ? "שאלה אחת ממתינה לתשובה"
                : `${questions.length} שאלות ממתינות לתשובה`}
          </p>
        </div>
        <Image
          src="/brand/mascot-peek.webp"
          alt=""
          width={355}
          height={360}
          className="h-auto w-24 shrink-0 drop-shadow-[0_10px_12px_rgb(23_50_72/0.18)] lg:w-28"
        />
      </header>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      {questions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-border/70 bg-surface px-5 py-16 text-center shadow-card">
          <Image src="/brand/mascot-celebrate.webp" alt="" width={520} height={503} className="h-auto w-40" />
          <p className="mt-3 text-lg font-bold">אין שאלות פתוחות כרגע</p>
          <p className="mt-1 text-sm text-muted-foreground">שאלות חדשות יופיעו כאן אוטומטית.</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 items-start gap-5 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
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
  const searchId = useId();
  const [search, setSearch] = useState("");
  const term = search.trim();
  const visible = term
    ? questions.filter((q) =>
        [q.question, ...Object.values(q.context ?? {})].some((text) => text.includes(term)),
      )
    : questions;

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-card">
      <div className="flex flex-col gap-3 px-4 pt-5 pb-3">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-mist text-primary">
            <MessagesSquare aria-hidden className="size-4.5" />
          </span>
          שאלות פתוחות מעובדים
        </h2>
        <p className="flex flex-wrap gap-2 text-sm font-semibold">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-primary bg-mist px-3 py-1 text-primary">
            הכל ({questions.length})
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1">
            <Clock aria-hidden className="size-3.5 text-pending" />
            ממתין ({questions.length})
          </span>
        </p>
        <label htmlFor={searchId} className="sr-only">
          חיפוש בשאלות
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="חיפוש לפי רכב, עיסוק או שאלה…"
            className="h-11 w-full rounded-full border border-border bg-background ps-9 pe-4 text-sm outline-none focus-visible:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
      </div>
      <nav aria-label="שאלות פתוחות">
        <ul className="flex flex-col gap-2 px-3 pb-3">
          {visible.map((question) => {
            const selected = question.id === selectedId;
            const summary = contextSummary(question.context);
            return (
              <li key={question.id}>
                <button
                  type="button"
                  onClick={() => onSelect(question.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 text-start break-words transition-colors",
                    "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    selected
                      ? "border-primary bg-mist/70 ring-2 ring-primary/20"
                      : "border-border/70 bg-surface hover:border-primary/40",
                  )}
                >
                  <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-mist text-primary">
                    <UserRound className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-extrabold">{fieldTitle(question.field)}</span>
                    {summary && <span className="line-clamp-1 text-xs text-muted-foreground">{summary}</span>}
                    <span className="line-clamp-1 text-xs text-foreground/80">{question.question}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusPill />
                    <time dateTime={question.created_at} className="text-[0.7rem] text-muted-foreground tabular-nums">
                      {timeFormatter.format(new Date(question.created_at))}
                    </time>
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">לא נמצאו שאלות לחיפוש הזה.</li>
          )}
        </ul>
      </nav>
    </div>
  );
}

function StatusPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-pending-surface px-2.5 py-1 text-xs font-bold text-pending">
      <Clock aria-hidden className="size-3.5" />
      ממתין
    </span>
  );
}

function QuestionPanel({ question }: { question: RepQuestionOut }) {
  const contextEntries = Object.entries(question.context ?? {});
  const requestedCar = question.context?.requested_car;

  return (
    <section
      aria-labelledby={`rep-question-${question.id}`}
      className="flex min-w-0 flex-col gap-5 rounded-3xl border border-border/70 bg-surface p-5 shadow-card lg:p-7"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-background px-3 py-1 text-xs font-bold text-muted-foreground tabular-nums">
          #<bdi dir="ltr">{question.id.slice(0, 8).toUpperCase()}</bdi>
        </span>
        <StatusPill />
        <span className="ms-auto text-sm font-bold text-primary">{fieldTitle(question.field)}</span>
      </div>

      <h2 id={`rep-question-${question.id}`} className="text-2xl font-extrabold leading-snug">
        {question.question}
      </h2>

      {contextEntries.length > 0 && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border/70 p-4 sm:flex-row sm:items-center">
          <span aria-hidden className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-mist text-primary">
            <UserRound className="size-6" />
          </span>
          <dl className="grid flex-1 gap-3 sm:grid-cols-2">
            {contextEntries.map(([key, value]) => (
              <div key={key} className="flex flex-col gap-0.5">
                <dt className="text-xs font-semibold text-muted-foreground">{CONTEXT_LABELS[key] ?? key}</dt>
                <dd className="text-sm font-bold break-words">
                  <bdi>{value}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          {requestedCar && (
            <Image src="/brand/svg/car-silhouette.svg" alt="" width={340} height={175} className="h-auto w-28 shrink-0 max-sm:hidden" />
          )}
        </div>
      )}

      <div className="rounded-2xl rounded-ss-md bg-mist px-5 py-4">
        <p className="text-sm leading-relaxed">
          השאלה נפתחה אוטומטית על ידי יועץ הרכב: זה פרט שרק החברה יודעת, והיועץ לא מנחש. ברגע שתענו, ההשוואה
          של העובד/ת תתעדכן אצלם מיד.
        </p>
        <time dateTime={question.created_at} className="mt-2 block text-xs text-muted-foreground tabular-nums">
          {timeFormatter.format(new Date(question.created_at))}
        </time>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(15rem,18rem)]">
        <div className="rounded-2xl border border-border/70 p-4 lg:p-5">
          <h3 className="mb-3 flex items-center gap-2 text-base font-extrabold">
            <PencilLine aria-hidden className="size-4.5 text-primary" />
            טיפול בבקשה
          </h3>
          <AnswerForm questionId={question.id} field={question.field} />
        </div>
        <div className="rounded-2xl border border-border/70 p-4 lg:p-5">
          <h3 className="mb-3 flex items-center gap-2 text-base font-extrabold">
            <History aria-hidden className="size-4.5 text-primary" />
            היסטוריית טיפול
          </h3>
          <ol className="flex flex-col">
            <TimelineStep tone="bg-brand-orange" icon={Clock} title="הבקשה נפתחה" note="על ידי יועץ הרכב">
              <time dateTime={question.created_at} className="tabular-nums">
                {timeFormatter.format(new Date(question.created_at))}
              </time>
            </TimelineStep>
            <TimelineStep tone="bg-primary" icon={UserRound} title="בטיפול נציג" note="ממתינה לתשובה" />
            <TimelineStep tone="bg-border" icon={Send} title="עדכון לעובד" note="נשלח מיד עם התשובה" last />
          </ol>
        </div>
      </div>
    </section>
  );
}

function TimelineStep({
  tone,
  icon: Icon,
  title,
  note,
  last = false,
  children,
}: {
  tone: string;
  icon: LucideIcon;
  title: string;
  note: string;
  last?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last && <span aria-hidden className="absolute start-[0.9rem] top-8 bottom-0 w-px bg-border" />}
      <span aria-hidden className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white", tone)}>
        <Icon className="size-3.5" />
      </span>
      <span className="flex flex-col text-sm">
        <span className="font-bold">{title}</span>
        <span className="text-xs text-muted-foreground">
          {children ? <>{children} · </> : null}
          {note}
        </span>
      </span>
    </li>
  );
}

/**
 * The answer's input follows the question (QA: a free-text box for an occupation was refused by the
 * server): an occupation is picked from the company's occupations table - which also decides the group -
 * and a participation is an amount in shekels with the date it applies from.
 */
function AnswerForm({ questionId, field }: { questionId: string; field: string }) {
  const kind: "occupation" | "participation" | "other" =
    field === "occupation" ? "occupation" : field.startsWith("participation:") ? "participation" : "other";
  const occupations = useOccupations();
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
      setError(kind === "occupation" ? "בחרו עיסוק מהטבלה לפני השליחה." : "הזינו תשובה לפני השליחה.");
      return;
    }
    if (kind === "participation") {
      const amount = Number(value.replaceAll(",", ""));
      if (!Number.isFinite(amount) || amount < 0) {
        setError("ההשתתפות היא סכום חודשי בשקלים, למשל 350.");
        return;
      }
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
          {kind === "occupation"
            ? "העיסוק מטבלת העיסוקים"
            : kind === "participation"
              ? "השתתפות חודשית של העובד (₪)"
              : "תשובה"}
        </label>
        {kind === "occupation" ? (
          <>
            <select
              id={valueId}
              name="value"
              required
              disabled={disabled || occupations.isPending}
              aria-invalid={error !== null || undefined}
              aria-describedby={error ? errorId : undefined}
              defaultValue=""
              className="rounded-xl h-11 w-full border border-input bg-surface px-3 text-base text-foreground aria-invalid:border-error"
            >
              <option value="" disabled>
                {occupations.isPending ? "טוען את טבלת העיסוקים…" : "בחרו את העיסוק המתאים"}
              </option>
              {(occupations.data ?? []).map((o) => (
                <option key={o.name} value={o.name}>
                  {o.name} · קבוצה {o.group}
                  {o.car_required ? " · רכב חובה" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              העיסוק קובע את קבוצת הזכאות. אם אף עיסוק לא מתאים, יש לעדכן קודם את טבלת העיסוקים.
            </p>
          </>
        ) : (
          <input
            id={valueId}
            name="value"
            type="text"
            inputMode={kind === "participation" ? "decimal" : undefined}
            dir={kind === "participation" ? "ltr" : undefined}
            required
            maxLength={500}
            disabled={disabled}
            aria-invalid={error !== null || undefined}
            aria-describedby={error ? errorId : undefined}
            placeholder={kind === "participation" ? "לדוגמה: 350" : undefined}
            className="rounded-xl h-11 w-full border border-input bg-surface px-3 text-base text-foreground aria-invalid:border-error"
          />
        )}
      </div>

      {kind === "participation" && (
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
            className="rounded-xl h-11 w-full min-w-0 max-w-full border border-input bg-surface px-3 text-base text-foreground sm:max-w-xs"
          />
        </div>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="rounded-2xl flex items-start gap-2 border border-error-border bg-error-surface px-3 py-2.5 text-sm text-error"
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
          {!answer.isPending && <Send aria-hidden data-icon="inline-start" className="rtl:-scale-x-100" />}
          {locked && !answer.isPending ? "נשלח" : answer.isPending ? "שולחים…" : "שלח עדכון לעובד"}
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

/** What the question is about, in words (the rep never sees field ids). */
function fieldTitle(field: string): string {
  if (field.startsWith("participation:")) return "אישור השתתפות ברכב";
  if (field === "occupation") return "אישור עיסוק";
  return "שאלה מיועץ הרכב";
}

function contextSummary(context: RepQuestionOut["context"]): string | null {
  if (!context) return null;
  const parts = ["occupation", "group", "requested_car"]
    .map((key) => context[key])
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" · ") : null;
}
