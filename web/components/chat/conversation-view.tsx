"use client";

import { PanelRight, Pencil } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { BottomSheet } from "@/components/chat/bottom-sheet";
import { ChatPanel, type ChatMessage } from "@/components/chat/chat-panel";
import { type PayslipApply, PayslipUpload } from "@/components/chat/payslip-upload";
import { RepStatusLine, RepWaitingPanel } from "@/components/chat/rep-waiting-panel";
import { ResizeHandle, useResizableWidth } from "@/components/chat/resize-handle";
import { VehicleList } from "@/components/chat/vehicle-list";
import { ComparisonCard, todayArrangementLabel } from "@/components/comparison-card";
import { OptionsMap } from "@/components/options-map";
import { ProfileCard } from "@/components/profile-card";
import { ProfileDialog } from "@/components/profile-dialog";
import { Topbar } from "@/components/topbar";
import { layoutPhaseFromStatus, stepFromStatus } from "@/lib/api/conversation-status";
import { defaultOptionId } from "@/lib/comparison";
import { isFormModeFallback } from "@/lib/api/form-mode";
import { CompareError, useCompare } from "@/lib/api/use-compare";
import {
  ConversationFetchError,
  useConversation,
  type ConversationState,
} from "@/lib/api/use-conversation";
import { OptionsFetchError, useOptions } from "@/lib/api/use-options";
import { PatchProfileError, usePatchProfile } from "@/lib/api/use-patch-profile";
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
  const patchProfile = usePatchProfile(conversationId);
  // A new upload box after each saved payslip (the review closes; the message goes to the advisor)
  const [payslipRound, setPayslipRound] = useState(0);

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
  // The car on screen survives a refresh (tester: after a refresh the screen jumped from the car waiting
  // for the rep to the best alternative - a waiver - and looked as if the rep had answered)
  const [userSelectedId, setUserSelectedId] = useRememberedSelection(conversationId);
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
  const transcript = withCurrentMissing(messages, data?.missing ?? []);
  const comparison = data?.latest_comparison ?? null;
  const galleryComparison = optionsQuery.data ?? comparison;
  const results = comparison?.results ?? [];
  const selectedOptionId =
    userSelectedId && results.some((r) => r.option.id === userSelectedId)
      ? userSelectedId
      : defaultOptionId(comparison);

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

  /**
   * The payslip values the employee confirmed: salary and deductions are saved (PATCH, like a manual
   * edit), then the advisor is told the car and its value of use - it finds the exact variant and asks
   * only what is still missing.
   */
  function handlePayslip(apply: PayslipApply) {
    const send = () => {
      setPayslipRound((round) => round + 1);
      handleSend(apply.message);
    };
    if (!apply.salary && !apply.deductions) {
      send();
      return;
    }
    patchProfile.mutate(
      {
        expected_revision: data?.profile.revision,
        ...(apply.salary ? { salary: apply.salary } : {}),
        ...(apply.deductions ? { deductions: apply.deductions } : {}),
      },
      { onSuccess: send },
    );
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
          <p className="text-sm text-muted-foreground">
            שיחה שמורה נפתחת רק מאותו דפדפן שבו התחילה. אפשר לנסות שוב, או להתחיל שיחה חדשה.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/c/new"
              className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-(--primary-hover)"
            >
              שיחה חדשה
            </Link>
            <button
              type="button"
              onClick={() => void conversation.refetch()}
              disabled={conversation.isFetching}
              className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted disabled:opacity-45"
            >
              {conversation.isFetching ? "מנסה…" : "ניסיון חוזר"}
            </button>
          </div>
        </main>
      </>
    );
  }

  const sideTitle = sideSheetTitle(displayPhase);
  // While details are missing, the payslip upload sits above the message box
  const payslip =
    (data.missing?.length ?? 0) > 0 ? (
      <PayslipUpload
        key={payslipRound}
        disabled={sendMessage.isPending}
        applying={patchProfile.isPending || sendMessage.isPending}
        applyError={
          patchProfile.error instanceof PatchProfileError
            ? patchProfile.error.message
            : patchProfile.error
              ? "שמירת הפרטים נכשלה. נסו שוב."
              : null
        }
        onApply={handlePayslip}
      />
    ) : null;
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
              toolbar={payslip}
              messages={transcript}
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
              messages={transcript}
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
                conversationId={conversationId}
                profile={data.profile}
                profileMissing={data.missing}
                messages={transcript}
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
                messages={transcript}
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
            messages={transcript}
            quickReplies={quickReplies}
            thinking={sendMessage.isPending}
            errorMessage={sendError}
                errorAction={modelBusy ? <FormModeLink /> : null}
            draft={draft}
            onDraftChange={setDraft}
            onSend={handleSend}
            onSelectOption={handleSelectOption}
            openQuestions={data.open_questions ?? []}
            toolbar={payslip}
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
  toolbar = null,
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
  toolbar?: ReactNode;
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
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,400px)] grid-rows-[minmax(0,1fr)] gap-0 p-4 lg:gap-4 lg:p-6">
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
        toolbar={toolbar}
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
  // The employee can drag the chat wider at the expense of the gallery (and it is remembered)
  const [chatWidth, setChatWidth] = useResizableWidth("strauss-chat-width-options", 320);
  const wide = chatWidth >= 560;

  return (
    <div
      className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-2 p-6"
      style={{ gridTemplateColumns: `${chatWidth}px auto minmax(0,1fr)` }}
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
        narrow={chatWidth < 400}
        wideToggle={{ wide, onToggle: () => setChatWidth(wide ? 320 : window.innerWidth * 0.6) }}
        onTraceOpenChange={(open) => open && chatWidth < 440 && setChatWidth(440)}
        className="min-h-0 min-w-0"
      />
      <ResizeHandle width={chatWidth} onWidth={setChatWidth} grows="left" />
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
  conversationId,
  profile,
  profileMissing,
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
  conversationId: string;
  profile: ConversationState["profile"];
  profileMissing: ConversationState["missing"];
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
  const [chatWidth, setChatWidth] = useResizableWidth("strauss-chat-width-comparison", 300, 0.3);
  // "Back to the full chat" (tester): the cars rail steps aside and the chat takes half the screen
  const [chatWide, setChatWide] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const shownResult =
    comparison.results.find((r) => r.option.id === selectedOptionId) ?? comparison.results[0] ?? null;

  return (
    <div className="flex min-h-0 flex-1 gap-4 p-6">
      {/* RTL: the first item is on the right. One fixed layout, three jobs:
          the alternatives (right) · the comparison (middle) · the chat (left). */}
      {!chatWide && (
        <VehicleList
          results={comparison.results}
          bestOptionId={comparison.best_option_id}
          selectedId={selectedOptionId}
          onSelect={onSelect}
          onAddCar={onChangeCar}
          className="shrink-0 self-stretch"
        />
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
        <ComparisonHeader
          optionLabel={shownResult?.option.label ?? null}
          todayLabel={todayArrangementLabel(comparison.profile_snapshot)}
          onEditDetails={() => setDetailsOpen(true)}
        />
        {waitingRep && openQuestions.length > 0 && <RepStatusLine questions={openQuestions} />}
        {waitingRep && openQuestions.length === 0 && (
          <RepWaitingPanel questions={openQuestions} missing={missing} />
        )}
        <ComparisonCard
          comparison={comparison}
          optionId={selectedOptionId}
          onChangeCar={onChangeCar}
          // its own height inside the scrolling column - squeezed to the screen, its background ended
          // mid-content (the "white rectangle" testers saw)
          className="shrink-0"
        />
      </div>
      <ProfileDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        conversationId={conversationId}
        profile={profile}
        missing={profileMissing}
      />
      <ResizeHandle width={chatWidth} onWidth={setChatWidth} grows="right" />
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
        narrow={!chatWide && chatWidth < 400}
        wideToggle={{ wide: chatWide, onToggle: () => setChatWide((wide) => !wide) }}
        onTraceOpenChange={(open) => open && chatWidth < 440 && setChatWidth(440)}
        className="shrink-0 self-stretch"
        style={{ width: chatWide ? "min(50vw, 760px)" : chatWidth }}
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
      {waitingRep && openQuestions.length > 0 && <RepStatusLine questions={openQuestions} />}
      {waitingRep && openQuestions.length === 0 && <RepWaitingPanel questions={openQuestions} missing={missing} />}
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
      <ProfileCard
        conversationId={data.id}
        profile={data.profile}
        missing={data.missing}
        recalculates
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

/**
 * The comparison's title row: which car against what, and the way to change the details behind it.
 * (It replaced a big "result!" banner that took a quarter of the screen.)
 */
function ComparisonHeader({
  optionLabel,
  todayLabel,
  onEditDetails,
}: {
  optionLabel: string | null;
  todayLabel: string;
  onEditDetails: () => void;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3 rounded-3xl bg-surface px-5 py-3 shadow-card">
      <Image src="/brand/mascot-celebrate.webp" alt="" width={520} height={503} className="h-auto w-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-extrabold">
          ההשוואה שלך{optionLabel ? <>: <bdi>{optionLabel}</bdi></> : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          מול <bdi>{todayLabel}</bdi>, לפי הפרטים שמסרת. משהו השתנה? ערכו את הפרטים או כתבו בצ&apos;אט, וההשוואה
          תחושב מחדש.
        </p>
      </div>
      <button
        type="button"
        onClick={onEditDetails}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-bold text-primary hover:bg-mist focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Pencil aria-hidden className="size-4" />
        עריכת הפרטים
      </button>
    </header>
  );
}

/**
 * A "missing details" card from an earlier message lists only what is STILL missing - a question the
 * employee already answered is not asked again; a card with nothing left disappears.
 */
function withCurrentMissing(
  messages: ChatMessage[],
  missing: NonNullable<ConversationState["missing"]>,
): ChatMessage[] {
  const still = new Set(missing.map((m) => m.field));
  return messages.map((message) => {
    if (!message.cards?.some((c) => c.kind === "missing")) return message;
    type Card = NonNullable<ChatMessage["cards"]>[number];
    const cards = message.cards.flatMap((card): Card[] => {
      if (card.kind !== "missing") return [card];
      const left = card.missing.filter((m) => still.has(m.field));
      return left.length > 0 ? [{ ...card, missing: left }] : [];
    });
    return { ...message, cards };
  });
}

/** The car the employee is looking at, kept per conversation in this tab (sessionStorage). */
function useRememberedSelection(conversationId: string) {
  const key = `strauss-selected-option:${conversationId}`;
  const [selected, setSelected] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null; // storage blocked: just not remembered
    }
  });
  const remember = (id: string | null) => {
    setSelected(id);
    try {
      if (id) window.sessionStorage.setItem(key, id);
      else window.sessionStorage.removeItem(key);
    } catch {
      // not remembered - fine
    }
  };
  return [selected, remember] as const;
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
