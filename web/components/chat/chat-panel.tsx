"use client";

import { SendHorizontal, UserRound } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { AgentActions } from "@/components/chat/agent-actions";
import { MessageCardView } from "@/components/chat/message-cards";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/utils";

export type MessageOut = components["schemas"]["MessageOut"];
type RepQuestionOut = components["schemas"]["RepQuestionOut"];

/** A transcript row. `sending` is the optimistic employee message, not a server field. */
export type ChatMessage = MessageOut & { sending?: boolean };

type ChatPanelProps = {
  messages: ChatMessage[];
  quickReplies: string[];
  thinking: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  disabled?: boolean;
  narrow?: boolean;
  errorMessage?: string | null;
  onSend: (text: string) => void;
  /** When set, options cards in messages can open a comparison. */
  onSelectOption?: (optionId: string) => void;
  /** Open rep questions, so a rep_pending card can show when it was asked. */
  openQuestions?: readonly RepQuestionOut[];
  /** True while a narrow chat has an AI-actions timeline open, so the parent can widen it. */
  onTraceOpenChange?: (open: boolean) => void;
  className?: string;
};

export function ChatPanel({
  messages,
  quickReplies,
  thinking,
  draft,
  onDraftChange,
  disabled = false,
  narrow = false,
  errorMessage,
  onSend,
  onSelectOption,
  openQuestions,
  onTraceOpenChange,
  className,
}: ChatPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [openTraces, setOpenTraces] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    onTraceOpenChange?.(openTraces.size > 0);
  }, [openTraces, onTraceOpenChange]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking || disabled) return;
    onSend(trimmed);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(draft);
  }

  return (
    <section
      aria-label="השיחה עם היועץ"
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-card",
        className,
      )}
    >
      {narrow ? (
        <header className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-mist/60 px-4 py-3">
          <Image src="/brand/mascot-avatar.webp" alt="" width={160} height={160} className="size-10 rounded-full bg-surface p-0.5 shadow-soft" />
          <h2 className="text-base font-extrabold">
            צ׳אט עם <bdi dir="ltr">Drive</bdi>
          </h2>
        </header>
      ) : (
        <header className="relative isolate flex h-32 shrink-0 items-center overflow-hidden border-b border-border/70 px-6 lg:h-36">
          <Image
            src="/brand/bg-flowing-ribbons.webp"
            alt=""
            fill
            sizes="(min-width: 1024px) 60vw, 100vw"
            className="-z-10 object-cover object-[70%_18%] opacity-90 dark:opacity-30"
          />
          <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-l from-surface via-surface/85 to-transparent" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-3xl leading-tight lg:text-4xl">היועץ שלך</h2>
            <p className="mt-1 text-sm text-foreground/80 lg:text-base">
              אני כאן כדי לעזור לך למצוא את המסלול המתאים עבורך.
            </p>
          </div>
          <Image
            src="/brand/mascot-hero.webp"
            alt=""
            width={898}
            height={900}
            sizes="160px"
            className="mascot-float -mb-6 h-auto w-32 shrink-0 drop-shadow-[0_12px_14px_rgb(23_50_72/0.18)] lg:w-40"
          />
        </header>
      )}

      <div
        ref={listRef}
        aria-live="polite"
        aria-relevant="additions"
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto",
          narrow ? "gap-4 px-3 py-4" : "gap-6 px-4 py-6 lg:px-6",
        )}
      >
        {messages.length === 0 && !thinking && (
          <div className="m-auto flex max-w-sm flex-col items-center gap-3 py-6 text-center">
            <Image src="/brand/mascot-guide.webp" alt="" width={514} height={520} className="h-auto w-36" />
            <p className="text-lg font-bold">שלום! אני יועץ הרכב של שטראוס.</p>
            <p className="text-sm text-muted-foreground">
              ספרו לי על התפקיד, השכר והרכב שלכם, ואראה לכם מה יקרה לנטו בכל חלופה.
            </p>
          </div>
        )}

        {messages.map((message) => {
          if (message.role === "system_event") {
            return (
              <article key={message.id} className="flex justify-center">
                <p className="max-w-[90%] rounded-full bg-success-surface px-4 py-1.5 text-center text-sm font-semibold text-success">
                  {message.text}
                </p>
              </article>
            );
          }
          const fromUser = message.role === "user";
          return (
            <article
              key={message.id}
              aria-busy={message.sending || undefined}
              className={cn("flex min-w-0 items-start gap-2.5", fromUser && "flex-row-reverse")}
            >
              {fromUser ? (
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-sky/70 text-primary",
                    narrow ? "size-8" : "size-11",
                  )}
                >
                  <UserRound className={narrow ? "size-4" : "size-5"} />
                </span>
              ) : (
                <Image
                  src="/brand/mascot-avatar.webp"
                  alt=""
                  width={160}
                  height={160}
                  className={cn("shrink-0 rounded-full bg-surface p-0.5 shadow-soft", narrow ? "size-8" : "size-11")}
                />
              )}
              <div className={cn("flex min-w-0 flex-col gap-2", fromUser ? "max-w-[85%] items-end" : "flex-1")}>
                <p className="sr-only">{roleLabel(message.role)}</p>
                <div
                  className={cn(
                    "min-w-0 rounded-3xl px-4 py-3 shadow-soft",
                    fromUser
                      ? "rounded-ee-md bg-mint"
                      : "max-w-[92%] self-start rounded-es-md bg-mist",
                    message.sending && "opacity-70",
                  )}
                >
                  <p className={cn("min-w-0 whitespace-pre-wrap break-words", narrow ? "text-sm" : "text-[0.98rem] leading-relaxed")}>
                    {message.text}
                  </p>
                </div>
                <p className={cn("px-1 text-xs text-muted-foreground", fromUser ? "self-end" : "self-start")}>
                  {message.sending ? "שולח…" : formatTime(message.created_at)}
                </p>
                {!fromUser &&
                  message.cards?.map((card, index) => (
                    <MessageCardView
                      key={`${message.id}-${card.kind}-${index}`}
                      card={card}
                      onSelectOption={onSelectOption}
                      askedAt={askedAtFor(card, message.created_at, openQuestions)}
                    />
                  ))}
                {!fromUser && (
                  <AgentActions
                    trace={message.trace}
                    messageId={message.id}
                    onOpenChange={(open) => {
                      setOpenTraces((current) => {
                        const next = new Set(current);
                        if (open) next.add(message.id);
                        else next.delete(message.id);
                        return next;
                      });
                    }}
                  />
                )}
              </div>
            </article>
          );
        })}

        {thinking && (
          <div className="flex items-end gap-2.5" aria-busy="true">
            <Image
              src="/brand/mascot-thinking.webp"
              alt=""
              width={353}
              height={360}
              className={cn("shrink-0 rounded-full bg-surface p-0.5 shadow-soft", narrow ? "size-8" : "size-11")}
            />
            <p className="inline-flex items-center gap-2 rounded-3xl rounded-es-md bg-mist px-4 py-3 text-sm font-medium text-muted-foreground shadow-soft">
              חושב
              <span aria-hidden className="typing-dots inline-flex gap-1">
                <span />
                <span />
                <span />
              </span>
            </p>
          </div>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="mx-4 mb-2 rounded-2xl border border-error-border bg-error-surface px-4 py-2 text-sm text-error">
          {errorMessage}
        </p>
      )}

      {quickReplies.length > 0 && !thinking && (
        <div className={cn("flex shrink-0 flex-wrap gap-2", narrow ? "px-3 pb-2" : "px-4 pb-3 lg:px-6")}>
          {quickReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              disabled={disabled || thinking}
              onClick={() => submit(reply)}
              className="min-h-11 max-w-full rounded-full border-2 border-primary/35 bg-surface px-5 py-2 text-start text-sm font-semibold break-words text-primary transition-colors hover:border-primary hover:bg-mist disabled:pointer-events-none disabled:opacity-50"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={cn("flex min-w-0 shrink-0 items-center gap-2 border-t border-border/70", narrow ? "p-2.5" : "p-3 lg:p-4")}
      >
        <label className="sr-only" htmlFor={inputId}>
          כתיבת הודעה
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onFocus={() => {
            const node = inputRef.current;
            if (!node) return;
            window.setTimeout(() => {
              node.scrollIntoView({ block: "nearest", inline: "nearest" });
            }, 300);
          }}
          disabled={disabled || thinking}
          placeholder={narrow ? "שאל שאלה…" : "כתוב הודעה כאן…"}
          autoComplete="off"
          enterKeyHint="send"
          className="min-h-12 min-w-0 flex-1 scroll-mb-4 rounded-full border border-border bg-background px-5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        />
        <Button
          type="submit"
          size="icon-lg"
          disabled={disabled || thinking || draft.trim().length === 0}
          aria-label="שליחת הודעה"
          className="shrink-0"
        >
          <SendHorizontal aria-hidden className="size-5 rtl:rotate-180" />
        </Button>
      </form>
    </section>
  );
}

const timeFormat = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" });

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : timeFormat.format(date);
}

function askedAtFor(
  card: NonNullable<MessageOut["cards"]>[number],
  messageCreatedAt: string,
  openQuestions: readonly RepQuestionOut[] | undefined,
): string | undefined {
  if (card.kind !== "rep_pending") return undefined;
  const match = openQuestions?.find((question) => question.id === card.question_id);
  return match?.created_at ?? messageCreatedAt;
}

function roleLabel(role: MessageOut["role"]): string {
  switch (role) {
    case "user":
      return "את/ה";
    case "assistant":
      return "יועץ הרכב";
    case "system_event":
      return "מערכת";
  }
}
