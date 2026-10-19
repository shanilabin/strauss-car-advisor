"use client";

import { PanelRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { BottomSheet } from "@/components/chat/bottom-sheet";
import { ChatPanel, type ChatMessage } from "@/components/chat/chat-panel";
import { RepWaitingPanel } from "@/components/chat/rep-waiting-panel";
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
import { useConversationRealtime } from "@/lib/realtime/use-conversation-realtime";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { cn } from "@/lib/utils";

type ConversationViewProps = {
  conversationId: string;
};

export function ConversationView({ conversationId }: ConversationViewProps) {
  useConversationRealtime(conversationId);
  const conversation = useConversation(conversationId);
  const sendMessage = useSendMessage(conversationId);
  const compare = useCompare(conversationId);

  // Remount via key={id} on the page resets this state when the conversation changes.
  const [draft, setDraft] = useState("");
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  /**
   * The employee's text while POST /messages is in flight.
   * Dropped as soon as the cached server transcript grows, so the masked
   * server text replaces it and the row is never shown twice.
   */
  const [outgoing, setOutgoing] = useState<{
    text: string;
    baseline: number;
    startedAt: string;
  } | null>(null);
  const [userSelectedId, setUserSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /**
   * GET /options saves a comparison and moves status to PRESENTED.
   * Keep the Options gallery until the employee picks a card (POST /compare).
   */
  const [browsingOptions, setBrowsingOptions] = useState(false);
  const [seenReady, setSeenReady] = useState(false);
  const [repAnnouncement, setRepAnnouncement] = useState("");
  const previousStatus = useRef(conversation.data?.status);
  const keyboardInset = useKeyboardInset();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("lock-viewport");
    return () => {
      root.classList.remove("lock-viewport");
    };
  }, []);

  useEffect(() => {
    const next = conversation.data?.status;
    const previous = previousStatus.current;
    previousStatus.current = next;
    if (previous === "WAITING_REP" && next && next !== "WAITING_REP") {
      setRepAnnouncement("הנציג עדכן את ההשוואה.");
    }
  }, [conversation.data?.status]);

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
  const showOutgoing =
    outgoing !== null && !sendMessage.isError && serverMessages.length <= outgoing.baseline;
  const messages: ChatMessage[] =
    showOutgoing && outgoing
      ? [
          ...serverMessages,
          {
            id: "sending",
            role: "user",
            text: outgoing.text,
            created_at: outgoing.startedAt,
            sending: true,
          },
        ]
      : serverMessages;
  const comparison = data?.latest_comparison ?? null;
  const galleryComparison = optionsQuery.data ?? comparison;
  const results = comparison?.results ?? [];
  const selectedOptionId =
    userSelectedId && results.some((r) => r.option.id === userSelectedId)
      ? userSelectedId
      : (comparison?.best_option_id ?? results[0]?.option.id ?? null);

  function handleSend(text: string) {
    const previousReplies = quickReplies;
    setDraft("");
    setQuickReplies([]);
    setOutgoing({
      text,
      baseline: data?.messages?.length ?? 0,
      startedAt: new Date().toISOString(),
    });
    sendMessage.mutate(text, {
      onSuccess: (turn) => {
        setOutgoing(null);
        setQuickReplies(turn.reply.quick_replies ?? []);
      },
      onError: () => {
        setOutgoing(null);
        setDraft(text);
        setQuickReplies(previousReplies);
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

  // When no model can answer (free-tier quota, provider down) the employee stays in the chat: the
  // message is kept, and the form - the same calculation, no AI - is one click away.
  const modelBusy = isFormModeFallback(sendMessage.error);
  const sendError = modelBusy
    ? "היועץ עמוס כרגע. ההודעה שלך נשמרה בתיבה: נסו לשלוח שוב בעוד רגע, או המשיכו במצב טופס (אותו חישוב בדיוק)."
    : sendMessage.error instanceof SendMessageError
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
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {repAnnouncement}
      </p>
      <main
        className={cn(
          "mx-auto flex w-full min-w-0 max-w-screen-2xl flex-1 flex-col",
          "max-lg:min-h-0 max-lg:overflow-hidden",
          "lg:h-[calc(100dvh-var(--topbar-h))]",
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
                errorAction={modelBusy ? <FormModeLink /> : null}
              draft={draft}
              onDraftChange={setDraft}
              onSend={handleSend}
              onSelectOption={handleSelectOption}
              openQuestions={data.open_questions ?? []}
            />
          )}
          {displayPhase === "options" && (
            <OptionsDesktop
              messages={messages}
              quickReplies={quickReplies}
              thinking={sendMessage.isPending}
              errorMessage={sendError}
                errorAction={modelBusy ? <FormModeLink /> : null}
              draft={draft}
              onDraftChange={setDraft}
              onSend={handleSend}
              onSelectOption={handleSelectOption}
              galleryComparison={galleryComparison}
              optionsPending={optionsQuery.isPending && !galleryComparison}
              optionsError={optionsQuery.error}
              selectingId={compare.isPending ? (compare.variables?.option_ids[0] ?? null) : null}
              selectedId={userSelectedId}
              compareError={compareError}
              openQuestions={data.open_questions ?? []}
            />
          )}
          {displayPhase === "comparison" && (
            comparison ? (
              <ComparisonDesktop
                messages={messages}
                quickReplies={quickReplies}
                thinking={sendMessage.isPending}
                errorMessage={sendError}
                errorAction={modelBusy ? <FormModeLink /> : null}
                draft={draft}
                onDraftChange={setDraft}
                onSend={handleSend}
                onSelectOption={handleSelectOption}
                comparison={comparison}
                selectedOptionId={selectedOptionId}
                onSelect={setUserSelectedId}
                onChangeCar={handleChangeCar}
                waitingRep={waitingRep}
                openQuestions={data.open_questions ?? []}
                missing={data.missing ?? []}
              />
            ) : (
              <CollectingDesktop
                conversationId={conversationId}
                profile={data.profile}
                missing={data.missing}
                messages={messages}
                quickReplies={quickReplies}
                thinking={sendMessage.isPending}
                errorMessage={sendError}
                errorAction={modelBusy ? <FormModeLink /> : null}
                draft={draft}
                onDraftChange={setDraft}
                onSend={handleSend}
                onSelectOption={handleSelectOption}
                openQuestions={data.open_questions ?? []}
              />
            )
          )}
        </div>

        {/* Mobile: chat full screen + bottom sheet for side content */}
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:hidden"
          style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
        >
          <ChatPanel
            messages={messages}
            quickReplies={quickReplies}
            thinking={sendMessage.isPending}
            errorMessage={sendError}
                errorAction={modelBusy ? <FormModeLink /> : null}
            draft={draft}
            onDraftChange={setDraft}
            onSend={handleSend}
            onSelectOption={handleSelectOption}
            openQuestions={data.open_questions ?? []}
            className="min-h-0 min-w-0 flex-1 border-0 border-b"
          />
          <div className="flex shrink-0 gap-2 border-t border-border bg-surface px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="rounded-full inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-border px-3 text-sm font-semibold hover:bg-muted"
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
              openQuestions={data.open_questions ?? []}
              missing={data.missing ?? []}
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
  errorAction = null,
  draft,
  onDraftChange,
  onSend,
  onSelectOption,
  openQuestions,
}: {
  conversationId: string;
  profile: ConversationState["profile"];
  missing: ConversationState["missing"];
  messages: ChatMessage[];
  quickReplies: string[];
  thinking: boolean;
  errorMessage: string | null;
  errorAction?: ReactNode;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (text: string) => void;
  onSelectOption: (optionId: string) => void;
  openQuestions: NonNullable<ConversationState["open_questions"]>;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,400px)] gap-0 p-4 lg:gap-4 lg:p-6">
      <ChatPanel
        messages={messages}
        quickReplies={quickReplies}
        thinking={thinking}
        errorMessage={errorMessage}
        errorAction={errorAction}
        draft={draft}
        onDraftChange={onDraftChange}
        onSend={onSend}
        onSelectOption={onSelectOption}
        openQuestions={openQuestions}
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
  errorAction = null,
  draft,
  onDraftChange,
  onSend,
  onSelectOption,
  galleryComparison,
  optionsPending,
  optionsError,
  selectingId,
  selectedId,
  compareError,
  openQuestions,
}: {
  messages: ChatMessage[];
  quickReplies: string[];
  thinking: boolean;
  errorMessage: string | null;
  errorAction?: ReactNode;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (text: string) => void;
  onSelectOption: (optionId: string) => void;
  galleryComparison: ConversationState["latest_comparison"];
  optionsPending: boolean;
  optionsError: Error | null;
  selectingId: string | null;
  selectedId: string | null;
  compareError: string | null;
  openQuestions: NonNullable<ConversationState["open_questions"]>;
}) {
  const [chatExpanded, setChatExpanded] = useState(false);

  return (
    <div
      className={cn(
        "grid min-h-0 flex-1 gap-4 p-6",
        chatExpanded ? "grid-cols-[440px_minmax(0,1fr)]" : "grid-cols-[280px_minmax(0,1fr)]",
      )}
    >
      <ChatPanel
        messages={messages}
        quickReplies={quickReplies}
        thinking={thinking}
        errorMessage={errorMessage}
        errorAction={errorAction}
        draft={draft}
        onDraftChange={onDraftChange}
        onSend={onSend}
        onSelectOption={onSelectOption}
        openQuestions={openQuestions}
        narrow={!chatExpanded}
        onTraceOpenChange={setChatExpanded}
        className="min-h-0 min-w-0 transition-[width] duration-300 ease-out motion-reduce:transition-none"
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
  errorAction = null,
  draft,
  onDraftChange,
  onSend,
  onSelectOption,
  comparison,
  selectedOptionId,
  onSelect,
  onChangeCar,
  waitingRep,
  openQuestions,
  missing,
}: {
  messages: ChatMessage[];
  quickReplies: string[];
  thinking: boolean;
  errorMessage: string | null;
  errorAction?: ReactNode;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (text: string) => void;
  onSelectOption: (optionId: string) => void;
  comparison: NonNullable<ConversationState["latest_comparison"]>;
  selectedOptionId: string | null;
  onSelect: (id: string) => void;
  onChangeCar: () => void;
  waitingRep: boolean;
  openQuestions: NonNullable<ConversationState["open_questions"]>;
  missing: NonNullable<ConversationState["missing"]>;
}) {
  const [chatExpanded, setChatExpanded] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 gap-4 p-6">
      {/* RTL: visual order is chat (end/left) · comparison · vehicles (start/right).
          Spec: vehicles on the right, comparison center, chat on the left.
          In RTL flex row: first item is on the right. So order: vehicles, comparison, chat. */}
      <VehicleList
        results={comparison.results}
        bestOptionId={comparison.best_option_id}
        selectedId={selectedOptionId}
        onSelect={onSelect}
        className="shrink-0 self-stretch"
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
        <ResultBanner />
        {waitingRep && (
          <RepWaitingPanel questions={openQuestions} missing={missing} />
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
        errorAction={errorAction}
        draft={draft}
        onDraftChange={onDraftChange}
        onSend={onSend}
        onSelectOption={onSelectOption}
        openQuestions={openQuestions}
        narrow={!chatExpanded}
        onTraceOpenChange={setChatExpanded}
        className={cn(
          "shrink-0 self-stretch transition-[width] duration-300 ease-out motion-reduce:transition-none",
          chatExpanded ? "w-[min(440px,42vw)]" : "w-[280px]",
        )}
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
  openQuestions,
  missing,
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
  openQuestions: NonNullable<ConversationState["open_questions"]>;
  missing: NonNullable<ConversationState["missing"]>;
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
    return <ProfileCard conversationId={data.id} profile={data.profile} missing={data.missing} />;
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {waitingRep && <RepWaitingPanel questions={openQuestions} missing={missing} />}
      <VehicleList
        results={comparison.results}
        bestOptionId={comparison.best_option_id}
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
          "flex items-center justify-center rounded-3xl border border-border/70 bg-surface p-8 text-sm text-muted-foreground shadow-card",
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
          "flex flex-col justify-center gap-2 rounded-3xl border border-border/70 bg-surface p-8 shadow-card",
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
        <p className="rounded-2xl border border-border bg-surface-raised px-4 py-2 text-sm text-muted-foreground" aria-live="polite">
          מחשבים השוואה…
        </p>
      )}
      {compareError && (
        <p role="alert" className="rounded-2xl border border-error-border bg-error-surface px-4 py-2 text-sm text-error">
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

/** The mockup's "יש תוצאה!" banner above the comparison: brand sky, the celebrating mascot. */
function ResultBanner() {
  return (
    <div className="relative isolate flex min-h-36 shrink-0 items-center overflow-hidden rounded-3xl px-6 py-5 shadow-card lg:min-h-44 lg:px-8">
      <Image
        src="/brand/bg-flowing-ribbons.webp"
        alt=""
        fill
        sizes="60vw"
        className="-z-10 object-cover object-[60%_30%] dark:opacity-30"
      />
      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-l from-surface/90 via-surface/70 to-transparent" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-4xl leading-tight lg:text-5xl">יש תוצאה!</p>
        <p className="font-display text-2xl leading-tight text-primary lg:text-3xl">הנה ההשוואה עבורך.</p>
        <p className="mt-2 max-w-md text-sm text-foreground/80">
          לפי הפרטים שמסרת, חישבנו את כל החלופות. למטה ההשוואה המלאה, עם פירוט מאיפה מגיע כל שקל.
        </p>
      </div>
      <Image
        src="/brand/mascot-celebrate.webp"
        alt=""
        width={520}
        height={503}
        className="mascot-float h-auto w-32 shrink-0 drop-shadow-[0_12px_14px_rgb(23_50_72/0.18)] lg:w-44"
      />
    </div>
  );
}

function FormModeLink() {
  return (
    <Link href="/form" className="font-bold text-primary underline underline-offset-4">
      למצב טופס
    </Link>
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
