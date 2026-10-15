"use client";

import { PanelRight } from "lucide-react";
import { useState } from "react";

import { BottomSheet } from "@/components/chat/bottom-sheet";
import { ChatPanel, type MessageOut } from "@/components/chat/chat-panel";
import { PlaceholderSlot } from "@/components/chat/placeholder-slot";
import { VehicleList } from "@/components/chat/vehicle-list";
import { Topbar } from "@/components/topbar";
import { layoutPhaseFromStatus, stepFromStatus } from "@/lib/api/conversation-status";
import {
  ConversationFetchError,
  useConversation,
  type ConversationState,
} from "@/lib/api/use-conversation";
import { SendMessageError, useSendMessage } from "@/lib/api/use-send-message";
import { cn } from "@/lib/utils";

type ConversationViewProps = {
  conversationId: string;
};

export function ConversationView({ conversationId }: ConversationViewProps) {
  const conversation = useConversation(conversationId);
  const sendMessage = useSendMessage(conversationId);

  // Remount via key={id} on the page resets this state when the conversation changes.
  const [localMessages, setLocalMessages] = useState<MessageOut[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [userSelectedId, setUserSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const data = conversation.data;
  const status = data?.status;
  const step = status ? stepFromStatus(status) : null;
  const phase = status ? layoutPhaseFromStatus(status) : "collecting";

  const serverMessages = data?.messages ?? [];
  const messages = [...serverMessages, ...localMessages];
  const comparison = data?.latest_comparison ?? null;
  const results = comparison?.results ?? [];
  const selectedOptionId =
    userSelectedId && results.some((r) => r.option.id === userSelectedId)
      ? userSelectedId
      : (comparison?.best_option_id ?? results[0]?.option.id ?? null);

  function handleSend(text: string) {
    sendMessage.mutate(text, {
      onSuccess: (turn) => {
        const now = new Date().toISOString();
        setLocalMessages((prev) => [
          ...prev,
          {
            id: `local-user-${now}`,
            role: "user",
            text,
            created_at: now,
          },
          {
            id: `local-assistant-${now}`,
            role: "assistant",
            text: turn.reply.text,
            cards: turn.reply.cards,
            created_at: now,
            trace: turn.trace,
          },
        ]);
        setQuickReplies(turn.reply.quick_replies ?? []);
      },
    });
  }

  const sendError =
    sendMessage.error instanceof SendMessageError
      ? sendMessage.error.message
      : sendMessage.error
        ? "שליחת ההודעה נכשלה. נסו שוב."
        : null;

  if (conversation.isPending && !data) {
    return (
      <>
        <Topbar step={null} />
        <main className="flex flex-1 items-center justify-center px-5 py-16 text-muted-foreground">
          טוען את השיחה…
        </main>
      </>
    );
  }

  if (conversation.isError || !data) {
    const message =
      conversation.error instanceof ConversationFetchError
        ? conversation.error.message
        : "לא ניתן לטעון את השיחה.";
    return (
      <>
        <Topbar step={null} />
        <main className="mx-auto flex w-full max-w-screen-md flex-1 flex-col justify-center gap-3 px-5 py-16">
          <h1 className="font-display text-3xl">שגיאה בטעינת השיחה</h1>
          <p role="alert" className="text-error">
            {message}
          </p>
        </main>
      </>
    );
  }

  const sideTitle = sideSheetTitle(phase);
  const waitingRep = data.status === "WAITING_REP";

  return (
    <>
      <Topbar step={step} />
      <main
        className={cn(
          "mx-auto flex w-full max-w-screen-2xl flex-1 flex-col",
          "min-h-[calc(100dvh-var(--topbar-h))]",
        )}
      >
        {/* Desktop phase layouts */}
        <div className="hidden min-h-0 flex-1 lg:flex lg:flex-col">
          {phase === "collecting" && (
            <CollectingDesktop
              messages={messages}
              quickReplies={quickReplies}
              thinking={sendMessage.isPending}
              errorMessage={sendError}
              onSend={handleSend}
            />
          )}
          {phase === "options" && (
            <OptionsDesktop
              messages={messages}
              quickReplies={quickReplies}
              thinking={sendMessage.isPending}
              errorMessage={sendError}
              onSend={handleSend}
            />
          )}
          {phase === "comparison" && (
            <ComparisonDesktop
              messages={messages}
              quickReplies={quickReplies}
              thinking={sendMessage.isPending}
              errorMessage={sendError}
              onSend={handleSend}
              results={results}
              selectedOptionId={selectedOptionId}
              onSelect={setUserSelectedId}
              waitingRep={waitingRep}
              openQuestions={data.open_questions ?? []}
            />
          )}
        </div>

        {/* Mobile: chat full screen + bottom sheet for side content */}
        <div className="flex min-h-0 flex-1 flex-col lg:hidden">
          <ChatPanel
            messages={messages}
            quickReplies={quickReplies}
            thinking={sendMessage.isPending}
            errorMessage={sendError}
            onSend={handleSend}
            className="min-h-0 flex-1 border-0 border-b"
          />
          <div className="flex shrink-0 gap-2 border-t border-border bg-surface px-3 py-2">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-border px-3 text-sm font-semibold hover:bg-muted"
            >
              <PanelRight aria-hidden className="size-4" />
              {sideTitle}
            </button>
          </div>
          <BottomSheet open={sheetOpen} title={sideTitle} onClose={() => setSheetOpen(false)}>
            <MobileSideContent
              phase={phase}
              data={data}
              results={results}
              selectedOptionId={selectedOptionId}
              onSelect={setUserSelectedId}
              waitingRep={waitingRep}
            />
          </BottomSheet>
        </div>
      </main>
    </>
  );
}

function CollectingDesktop({
  messages,
  quickReplies,
  thinking,
  errorMessage,
  onSend,
}: {
  messages: MessageOut[];
  quickReplies: string[];
  thinking: boolean;
  errorMessage: string | null;
  onSend: (text: string) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,400px)] gap-0 p-4 lg:gap-4 lg:p-6">
      <ChatPanel
        messages={messages}
        quickReplies={quickReplies}
        thinking={thinking}
        errorMessage={errorMessage}
        onSend={onSend}
        className="min-h-0"
      />
      <PlaceholderSlot
        label="פרופיל עובד"
        hint="כאן יופיע כרטיס הפרופיל (משימה B2.3)."
        className="min-h-0"
      />
    </div>
  );
}

function OptionsDesktop({
  messages,
  quickReplies,
  thinking,
  errorMessage,
  onSend,
}: {
  messages: MessageOut[];
  quickReplies: string[];
  thinking: boolean;
  errorMessage: string | null;
  onSend: (text: string) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] gap-4 p-6">
      <ChatPanel
        messages={messages}
        quickReplies={quickReplies}
        thinking={thinking}
        errorMessage={errorMessage}
        onSend={onSend}
        narrow
        className="min-h-0"
      />
      <PlaceholderSlot
        label="מפת אפשרויות"
        hint="כאן תופיע גלריית החלופות (משימה B3.2)."
        className="min-h-0"
      />
    </div>
  );
}

function ComparisonDesktop({
  messages,
  quickReplies,
  thinking,
  errorMessage,
  onSend,
  results,
  selectedOptionId,
  onSelect,
  waitingRep,
  openQuestions,
}: {
  messages: MessageOut[];
  quickReplies: string[];
  thinking: boolean;
  errorMessage: string | null;
  onSend: (text: string) => void;
  results: NonNullable<ConversationState["latest_comparison"]>["results"];
  selectedOptionId: string | null;
  onSelect: (id: string) => void;
  waitingRep: boolean;
  openQuestions: NonNullable<ConversationState["open_questions"]>;
}) {
  return (
    <div className="flex min-h-0 flex-1 gap-4 p-6">
      {/* RTL: visual order is chat (end/left) · comparison · vehicles (start/right).
          In DOM we place chat first so logical start in RTL is the right-side vehicles last…
          Spec: vehicles on the right, comparison center, chat on the left.
          In RTL flex row: first item is on the right. So order: vehicles, comparison, chat. */}
      <VehicleList
        results={results}
        selectedId={selectedOptionId}
        onSelect={onSelect}
        className="shrink-0 self-stretch"
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
        {waitingRep && (
          <div
            role="status"
            className="border border-pending-border bg-pending-surface px-4 py-3 text-sm text-pending"
          >
            <p className="font-bold text-foreground">ממתינים לתשובת נציג התחבורה</p>
            {openQuestions[0] && (
              <p className="mt-1 text-foreground">{openQuestions[0].question}</p>
            )}
          </div>
        )}
        <PlaceholderSlot
          label="כרטיס השוואה"
          hint="כאן תופיע ההשוואה המלאה (משימה B3.1)."
          className="min-h-64 flex-1"
        />
      </div>
      <ChatPanel
        messages={messages}
        quickReplies={quickReplies}
        thinking={thinking}
        errorMessage={errorMessage}
        onSend={onSend}
        narrow
        className="w-[280px] shrink-0 self-stretch"
      />
    </div>
  );
}

function MobileSideContent({
  phase,
  data,
  results,
  selectedOptionId,
  onSelect,
  waitingRep,
}: {
  phase: ReturnType<typeof layoutPhaseFromStatus>;
  data: ConversationState;
  results: NonNullable<ConversationState["latest_comparison"]>["results"];
  selectedOptionId: string | null;
  onSelect: (id: string) => void;
  waitingRep: boolean;
}) {
  if (phase === "collecting") {
    return (
      <PlaceholderSlot
        label="פרופיל עובד"
        hint="כאן יופיע כרטיס הפרופיל (משימה B2.3)."
      />
    );
  }

  if (phase === "options") {
    return (
      <PlaceholderSlot
        label="מפת אפשרויות"
        hint="כאן תופיע גלריית החלופות (משימה B3.2)."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {waitingRep && (
        <div
          role="status"
          className="border border-pending-border bg-pending-surface px-4 py-3 text-sm"
        >
          <p className="font-bold">ממתינים לתשובת נציג התחבורה</p>
          {data.open_questions?.[0] && (
            <p className="mt-1">{data.open_questions[0].question}</p>
          )}
        </div>
      )}
      <VehicleList
        results={results}
        selectedId={selectedOptionId}
        onSelect={onSelect}
        fluid
      />
      <PlaceholderSlot
        label="כרטיס השוואה"
        hint="כאן תופיע ההשוואה המלאה (משימה B3.1)."
      />
    </div>
  );
}

function sideSheetTitle(phase: ReturnType<typeof layoutPhaseFromStatus>): string {
  switch (phase) {
    case "collecting":
      return "הפרופיל";
    case "options":
      return "האפשרויות";
    case "comparison":
      return "ההשוואה";
  }
}
