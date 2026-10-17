"use client";

import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";

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
  className,
}: ChatPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

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
      className={cn("flex min-h-0 flex-col border border-border bg-surface", className)}
    >
      <header className="flex shrink-0 items-center border-b border-border px-4 py-3">
        <h2 className={cn("font-semibold", narrow ? "text-sm" : "text-base")}>השיחה עם היועץ</h2>
      </header>

      <div
        ref={listRef}
        aria-live="polite"
        aria-relevant="additions"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !thinking && (
          <p className="text-sm text-muted-foreground">כתבו הודעה כדי להתחיל את השיחה.</p>
        )}

        {messages.map((message) => (
          <article
            key={message.id}
            aria-busy={message.sending || undefined}
            className={cn(
              "flex flex-col gap-1",
              message.role === "user" && "border-s-2 border-cobalt ps-3",
              message.role === "system_event" && "text-sm text-muted-foreground",
            )}
          >
            <p className="text-xs font-bold text-muted-foreground">
              {roleLabel(message.role)}
              {message.sending ? " · שולח…" : ""}
            </p>
            <p className={cn("whitespace-pre-wrap", narrow ? "text-sm" : "text-base")}>
              {message.text}
            </p>
            {message.role === "assistant" &&
              message.cards?.map((card, index) => (
                <MessageCardView
                  key={`${message.id}-${card.kind}-${index}`}
                  card={card}
                  onSelectOption={onSelectOption}
                  askedAt={askedAtFor(card, message.created_at, openQuestions)}
                />
              ))}
          </article>
        ))}

        {thinking && (
          <p className="text-sm font-medium text-muted-foreground" aria-busy="true">
            חושב…
          </p>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="border-t border-error-border bg-error-surface px-4 py-2 text-sm text-error">
          {errorMessage}
        </p>
      )}

      {quickReplies.length > 0 && !thinking && (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3">
          {quickReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              disabled={disabled || thinking}
              onClick={() => submit(reply)}
              className="min-h-11 border border-border bg-surface px-3 py-2 text-sm font-semibold hover:border-primary hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-stretch gap-2 border-t border-border p-3"
      >
        <label className="sr-only" htmlFor="chat-input">
          כתיבת הודעה
        </label>
        <input
          id="chat-input"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          disabled={disabled || thinking}
          placeholder="כתיבת הודעה…"
          autoComplete="off"
          className="min-h-11 min-w-0 flex-1 border border-input bg-background px-3 text-base outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || thinking || draft.trim().length === 0}
          aria-label="שליחת הודעה"
        >
          <SendHorizontal aria-hidden className="size-4 rtl:rotate-180" />
        </Button>
      </form>
    </section>
  );
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
