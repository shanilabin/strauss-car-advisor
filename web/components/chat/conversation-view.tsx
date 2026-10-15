"use client";

import { PanelRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BottomSheet } from "@/components/chat/bottom-sheet";
import { ChatPanel, type MessageOut } from "@/components/chat/chat-panel";
import { VehicleList } from "@/components/chat/vehicle-list";
import { ComparisonCard } from "@/components/comparison-card";
import { OptionsMap } from "@/components/options-map";
import { ProfileCard } from "@/components/profile-card";
import { Topbar } from "@/components/topbar";
import { layoutPhaseFromStatus, stepFromStatus } from "@/lib/api/conversation-status";
import { isFormModeFallback } from "@/lib/api/form-mode";
import { CompareError, useCompare } from "@/lib/api/use-compare";
import {
  ConversationFetchError,
  useConversation,
  type ConversationState,
} from "@/lib/api/use-conversation";
import { OptionsFetchError, useOptions } from "@/lib/api/use-options";
import { SendMessageError, useSendMessage } from "@/lib/api/use-send-message";
import { cn } from "@/lib/utils";

type ConversationViewProps = {
  conversationId: string;
};

export function ConversationView({ conversationId }: ConversationViewProps) {
  const router = useRouter();
  const conversation = useConversation(conversationId);
  const sendMessage = useSendMessage(conversationId);
  const compare = useCompare(conversationId);

  // Remount via key={id} on the page resets this state when the conversation changes.
  const [localMessages, setLocalMessages] = useState<MessageOut[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [userSelectedId, setUserSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /**
   * GET /options saves a comparison and moves status to PRESENTED.
   * Keep the Options gallery until the employee picks a card (POST /compare).
   */
  const [browsingOptions, setBrowsingOptions] = useState(false);
  const [seenReady, setSeenReady] = useState(false);

  const data = conversation.data;
  const status = data?.status;
  const step = status ? stepFromStatus(status) : null;
  const phase = status ? layoutPhaseFromStatus(status) : "collecting";

  // Adjust state during render when status becomes READY (avoids setState-in-effect).
  if (status === "READY" && !seenReady) {
    setSeenReady(true);
    setBrowsingOptions(true);
  }

  const showOptionsGallery = browsingOptions || phase === "options";
  const displayPhase = showOptionsGallery ? "options" : phase;

  const optionsQuery = useOptions(conversationId, showOptionsGallery);

  const serverMessages = data?.messages ?? [];
  const messages = [...serverMessages, ...localMessages];
  const comparison = data?.latest_comparison ?? null;
  const galleryComparison = optionsQuery.data ?? comparison;
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
      onError: (error) => {
        if (isFormModeFallback(error)) {
          router.push("/form");
        }
      },
    });
  }

  function handleSelectOption(optionId: string) {
    compare.mutate(
      { option_ids: [optionId] },
      {
        onSuccess: () => {
          setUserSelectedId(optionId);
          setBrowsingOptions(false);
        },
      },
    );
  }

  function handleChangeCar() {
    setBrowsingOptions(true);
  }

  const sendError =
    sendMessage.error instanceof SendMessageError
      ? sendMessage.error.message
      : sendMessage.error
        ? "שליחת ההודעה נכשלה. נסו שוב."
        : null;

  const compareError =
    compare.error instanceof CompareError
      ? compare.error.message
      : compare.error
        ? "טעינת ההשוואה נכשלה. נסו שוב."
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

  const sideTitle = sideSheetTitle(displayPhase);
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
          {displayPhase === "collecting" && (
            <CollectingDesktop
              conversationId={conversationId}
              profile={data.profile}
              missing={data.missing}
              messages={messages}
              quickReplies={quickReplies}
              thinking={sendMessage.isPending}
              errorMessage={sendError}
              onSend={handleSend}
              onSelectOption={handleSelectOption}
            />
          )}
          {displayPhase === "options" && (
            <OptionsDesktop
              messages={messages}
              quickReplies={quickReplies}
              thinking={sendMessage.isPending}
              errorMessage={sendError}
              onSend={handleSend}
              onSelectOption={handleSelectOption}
              galleryComparison={galleryComparison}
              optionsPending={optionsQuery.isPending && !galleryComparison}
              optionsError={optionsQuery.error}
              selectingId={compare.isPending ? (compare.variables?.option_ids[0] ?? null) : null}
              selectedId={userSelectedId}
              compareError={compareError}
            />
          )}
          {displayPhase === "comparison" && (
            comparison ? (
              <ComparisonDesktop
                messages={messages}
                quickReplies={quickReplies}
                thinking={sendMessage.isPending}
                errorMessage={sendError}
                onSend={handleSend}
                onSelectOption={handleSelectOption}
                comparison={comparison}
                selectedOptionId={selectedOptionId}
                onSelect={setUserSelectedId}
                onChangeCar={handleChangeCar}
                waitingRep={waitingRep}
                openQuestions={data.open_questions ?? []}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                אין השוואה מהשרת עדיין.
              </div>
            )
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
            onSelectOption={handleSelectOption}
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
              phase={displayPhase}
              data={data}
              comparison={comparison}
              galleryComparison={galleryComparison}
              optionsPending={optionsQuery.isPending && !galleryComparison}
              optionsError={optionsQuery.error}
              selectingId={compare.isPending ? (compare.variables?.option_ids[0] ?? null) : null}
              compareError={compareError}
              selectedOptionId={selectedOptionId}
              previousSelectedId={userSelectedId}
              onSelect={setUserSelectedId}
              onSelectOption={handleSelectOption}
              onChangeCar={handleChangeCar}
              waitingRep={waitingRep}
            />
          </BottomSheet>
        </div>
      </main>
    </>
  );
}

function CollectingDesktop({
  conversationId,
  profile,
  missing,
  messages,
  quickReplies,
  thinking,
  errorMessage,
  onSend,
  onSelectOption,
}: {
  conversationId: string;
  profile: ConversationState["profile"];
  missing: ConversationState["missing"];
  messages: MessageOut[];
  quickReplies: string[];
  thinking: boolean;
  errorMessage: string | null;
  onSend: (text: string) => void;
  onSelectOption: (optionId: string) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,400px)] gap-0 p-4 lg:gap-4 lg:p-6">
      <ChatPanel
        messages={messages}
        quickReplies={quickReplies}
        thinking={thinking}
        errorMessage={errorMessage}
        onSend={onSend}
        onSelectOption={onSelectOption}
        className="min-h-0"
      />
      <ProfileCard
        conversationId={conversationId}
        profile={profile}
        missing={missing}
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
  onSelectOption,
  galleryComparison,
  optionsPending,
  optionsError,
  selectingId,
  selectedId,
  compareError,
}: {
  messages: MessageOut[];
  quickReplies: string[];
  thinking: boolean;
  errorMessage: string | null;
  onSend: (text: string) => void;
  onSelectOption: (optionId: string) => void;
  galleryComparison: ConversationState["latest_comparison"];
  optionsPending: boolean;
  optionsError: Error | null;
  selectingId: string | null;
  selectedId: string | null;
  compareError: string | null;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] gap-4 p-6">
      <ChatPanel
        messages={messages}
        quickReplies={quickReplies}
        thinking={thinking}
        errorMessage={errorMessage}
        onSend={onSend}
        onSelectOption={onSelectOption}
        narrow
        className="min-h-0"
      />
      <OptionsGalleryPanel
        galleryComparison={galleryComparison}
        optionsPending={optionsPending}
        optionsError={optionsError}
        selectingId={selectingId}
        selectedId={selectedId}
        compareError={compareError}
        onSelectOption={onSelectOption}
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
  onSelectOption,
  comparison,
  selectedOptionId,
  onSelect,
  onChangeCar,
  waitingRep,
  openQuestions,
}: {
  messages: MessageOut[];
  quickReplies: string[];
  thinking: boolean;
  errorMessage: string | null;
  onSend: (text: string) => void;
  onSelectOption: (optionId: string) => void;
  comparison: NonNullable<ConversationState["latest_comparison"]>;
  selectedOptionId: string | null;
  onSelect: (id: string) => void;
  onChangeCar: () => void;
  waitingRep: boolean;
  openQuestions: NonNullable<ConversationState["open_questions"]>;
}) {
  return (
    <div className="flex min-h-0 flex-1 gap-4 p-6">
      {/* RTL: visual order is chat (end/left) · comparison · vehicles (start/right).
          Spec: vehicles on the right, comparison center, chat on the left.
          In RTL flex row: first item is on the right. So order: vehicles, comparison, chat. */}
      <VehicleList
        results={comparison.results}
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
        <ComparisonCard
          comparison={comparison}
          optionId={selectedOptionId}
          onChangeCar={onChangeCar}
          className="min-h-0 flex-1"
        />
      </div>
      <ChatPanel
        messages={messages}
        quickReplies={quickReplies}
        thinking={thinking}
        errorMessage={errorMessage}
        onSend={onSend}
        onSelectOption={onSelectOption}
        narrow
        className="w-[280px] shrink-0 self-stretch"
      />
    </div>
  );
}

function MobileSideContent({
  phase,
  data,
  comparison,
  galleryComparison,
  optionsPending,
  optionsError,
  selectingId,
  compareError,
  selectedOptionId,
  previousSelectedId,
  onSelect,
  onSelectOption,
  onChangeCar,
  waitingRep,
}: {
  phase: ReturnType<typeof layoutPhaseFromStatus>;
  data: ConversationState;
  comparison: ConversationState["latest_comparison"];
  galleryComparison: ConversationState["latest_comparison"];
  optionsPending: boolean;
  optionsError: Error | null;
  selectingId: string | null;
  compareError: string | null;
  selectedOptionId: string | null;
  previousSelectedId: string | null;
  onSelect: (id: string) => void;
  onSelectOption: (optionId: string) => void;
  onChangeCar: () => void;
  waitingRep: boolean;
}) {
  if (phase === "collecting") {
    return (
      <ProfileCard
        conversationId={data.id}
        profile={data.profile}
        missing={data.missing}
      />
    );
  }

  if (phase === "options") {
    return (
      <OptionsGalleryPanel
        galleryComparison={galleryComparison}
        optionsPending={optionsPending}
        optionsError={optionsError}
        selectingId={selectingId}
        selectedId={previousSelectedId}
        compareError={compareError}
        onSelectOption={onSelectOption}
      />
    );
  }

  if (!comparison) {
    return (
      <p className="px-1 py-6 text-sm text-muted-foreground">אין השוואה מהשרת עדיין.</p>
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
        results={comparison.results}
        selectedId={selectedOptionId}
        onSelect={onSelect}
        fluid
      />
      <ComparisonCard
        comparison={comparison}
        optionId={selectedOptionId}
        onChangeCar={onChangeCar}
      />
    </div>
  );
}

function OptionsGalleryPanel({
  galleryComparison,
  optionsPending,
  optionsError,
  selectingId,
  selectedId = null,
  compareError,
  onSelectOption,
  className,
}: {
  galleryComparison: ConversationState["latest_comparison"];
  optionsPending: boolean;
  optionsError: Error | null;
  selectingId: string | null;
  selectedId?: string | null;
  compareError: string | null;
  onSelectOption: (optionId: string) => void;
  className?: string;
}) {
  if (optionsPending) {
    return (
      <div
        className={cn(
          "flex items-center justify-center border border-border bg-surface p-8 text-sm text-muted-foreground",
          className,
        )}
        aria-busy="true"
      >
        טוען אפשרויות…
      </div>
    );
  }

  if (optionsError || !galleryComparison) {
    const message =
      optionsError instanceof OptionsFetchError
        ? optionsError.message
        : optionsError
          ? "טעינת האפשרויות נכשלה. נסו שוב."
          : "אין אפשרויות מהשרת עדיין.";
    return (
      <div
        className={cn(
          "flex flex-col justify-center gap-2 border border-border bg-surface p-8",
          className,
        )}
      >
        <p role="alert" className="text-sm text-error">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      {selectedId && (
        <p className="text-sm text-muted-foreground" role="status">
          בחרו רכב אחר להשוואה מחדש. הבחירה הקודמת נשמרת עד שתבחרו.
        </p>
      )}
      {selectingId && (
        <p className="border border-border bg-surface-raised px-4 py-2 text-sm text-muted-foreground" aria-live="polite">
          מחשבים השוואה…
        </p>
      )}
      {compareError && (
        <p role="alert" className="border border-error-border bg-error-surface px-4 py-2 text-sm text-error">
          {compareError}
        </p>
      )}
      <OptionsMap
        results={galleryComparison.results}
        bestOptionId={galleryComparison.best_option_id}
        onSelect={onSelectOption}
        selectedId={selectedId}
        selectingId={selectingId}
        className="min-h-0 flex-1"
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
