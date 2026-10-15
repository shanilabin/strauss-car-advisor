"use client";

import { useState } from "react";

import { ComparisonCard } from "@/components/comparison-card";
import { OptionsMap } from "@/components/options-map";
import { ProfileCard } from "@/components/profile-card";
import { Topbar, type Step } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { CompareError, useCompare } from "@/lib/api/use-compare";
import {
  ConversationFetchError,
  useConversation,
} from "@/lib/api/use-conversation";
import {
  CreateConversationError,
  useCreateConversation,
} from "@/lib/api/use-create-conversation";
import { OptionsFetchError, useOptions } from "@/lib/api/use-options";
import {
  SAMPLE_EMPLOYEES,
  type SampleEmployeeEntry,
} from "@/lib/fixtures/sample-employees";
import { useSession } from "@/lib/supabase/use-session";
import { cn } from "@/lib/utils";

type FormStage = "pick" | "profile" | "options" | "comparison";

function stepForStage(stage: FormStage): Step | null {
  switch (stage) {
    case "pick":
      return null;
    case "profile":
      return 1;
    case "options":
      return 2;
    case "comparison":
      return 3;
  }
}

/**
 * Guided /form flow without chat: sample employee → profile → options → comparison.
 * Uses the same employee anonymous session and typed conversation/compare APIs.
 */
export function FormFlow() {
  const session = useSession();
  const createConversation = useCreateConversation();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [stage, setStage] = useState<FormStage>("pick");
  const [userSelectedId, setUserSelectedId] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);

  const conversation = useConversation(conversationId ?? "");
  const compare = useCompare(conversationId ?? "");
  const showOptions = stage === "options" || stage === "comparison";
  const optionsQuery = useOptions(conversationId ?? "", showOptions && stage === "options");

  const data = conversation.data;
  const comparison = data?.latest_comparison ?? null;
  const galleryComparison = optionsQuery.data ?? comparison;
  const results = comparison?.results ?? [];
  const selectedOptionId =
    userSelectedId && results.some((r) => r.option.id === userSelectedId)
      ? userSelectedId
      : (comparison?.best_option_id ?? results[0]?.option.id ?? null);

  const createError =
    createConversation.error instanceof CreateConversationError
      ? createConversation.error.message
      : createConversation.error
        ? "יצירת השיחה נכשלה. נסו שוב."
        : null;

  const compareError =
    compare.error instanceof CompareError
      ? compare.error.message
      : compare.error
        ? "טעינת ההשוואה נכשלה. נסו שוב."
        : null;

  function handlePick(employee: SampleEmployeeEntry) {
    if (!session.session || createConversation.isPending) return;
    setPickedName(employee.name);
    createConversation.mutate(
      { sample_employee_id: employee.id },
      {
        onSuccess: (state) => {
          setConversationId(state.id);
          setUserSelectedId(null);
          setStage("profile");
        },
      },
    );
  }

  function handleSelectOption(optionId: string) {
    if (!conversationId) return;
    compare.mutate(
      { option_ids: [optionId] },
      {
        onSuccess: () => {
          setUserSelectedId(optionId);
          setStage("comparison");
        },
      },
    );
  }

  function handleChangeCar() {
    setStage("options");
  }

  return (
    <>
      <Topbar step={stepForStage(stage)} />
      <main
        className={cn(
          "mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-5 py-8",
          "min-h-[calc(100dvh-var(--topbar-h))] lg:px-8",
        )}
      >
        <header className="max-w-2xl">
          <h1 className="font-display text-3xl sm:text-4xl">מצב טופס</h1>
          <p className="mt-2 text-muted-foreground">
            אותו חישוב כמו בשיחה, בלי העוזר. בחרו עובד לדוגמה, בדקו את הפרופיל, בחרו רכב וצפו
            בהשוואה.
          </p>
          {pickedName && stage !== "pick" && (
            <p className="mt-2 text-sm">
              עובד נבחר: <span className="font-semibold">{pickedName}</span>
            </p>
          )}
        </header>

        {session.loading && (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            מתחברים…
          </p>
        )}
        {session.error && (
          <p role="alert" className="text-sm text-error">
            {session.error}
          </p>
        )}

        {stage === "pick" && (
          <EmployeePicker
            disabled={!session.session || createConversation.isPending}
            pending={createConversation.isPending}
            error={createError}
            onPick={handlePick}
          />
        )}

        {stage === "profile" && conversationId && (
          <ProfileStage
            conversationId={conversationId}
            loading={conversation.isPending && !data}
            error={conversation.error}
            data={data}
            onContinue={() => setStage("options")}
            onBack={() => {
              setConversationId(null);
              setPickedName(null);
              setStage("pick");
            }}
          />
        )}

        {stage === "options" && conversationId && (
          <OptionsStage
            galleryComparison={galleryComparison}
            optionsPending={optionsQuery.isPending && !galleryComparison}
            optionsError={optionsQuery.error}
            selectingId={compare.isPending ? (compare.variables?.option_ids[0] ?? null) : null}
            selectedId={userSelectedId}
            compareError={compareError}
            onSelectOption={handleSelectOption}
            onBack={() => setStage("profile")}
          />
        )}

        {stage === "comparison" && conversationId && (
          <ComparisonStage
            loading={conversation.isPending && !comparison}
            error={conversation.error}
            comparison={comparison}
            selectedOptionId={selectedOptionId}
            onChangeCar={handleChangeCar}
            waitingRep={data?.status === "WAITING_REP"}
            openQuestion={data?.open_questions?.[0]?.question ?? null}
          />
        )}
      </main>
    </>
  );
}

function EmployeePicker({
  disabled,
  pending,
  error,
  onPick,
}: {
  disabled: boolean;
  pending: boolean;
  error: string | null;
  onPick: (employee: SampleEmployeeEntry) => void;
}) {
  return (
    <section aria-label="בחירת עובד לדוגמה" className="flex flex-col gap-3">
      <h2 className="font-semibold">בחרו עובד לדוגמה</h2>
      {pending && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          יוצרים שיחה…
        </p>
      )}
      {error && (
        <p role="alert" className="border border-error-border bg-error-surface px-4 py-2 text-sm text-error">
          {error}
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {SAMPLE_EMPLOYEES.map((employee) => (
          <li key={employee.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(employee)}
              className={cn(
                "flex min-h-11 w-full flex-col gap-1 border border-border bg-surface px-4 py-4 text-start",
                "hover:border-primary hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
                "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <span className="font-semibold">{employee.name}</span>
              <span className="text-sm text-muted-foreground">{employee.occupation}</span>
              <span className="mt-1 text-sm">{employee.question}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProfileStage({
  conversationId,
  loading,
  error,
  data,
  onContinue,
  onBack,
}: {
  conversationId: string;
  loading: boolean;
  error: Error | null;
  data: ReturnType<typeof useConversation>["data"];
  onContinue: () => void;
  onBack: () => void;
}) {
  if (loading) {
    return (
      <p className="text-sm text-muted-foreground" aria-busy="true">
        טוען פרופיל…
      </p>
    );
  }

  if (error || !data) {
    const message =
      error instanceof ConversationFetchError
        ? error.message
        : "לא ניתן לטעון את הפרופיל.";
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm text-error">
          {message}
        </p>
        <Button type="button" variant="outline" onClick={onBack}>
          חזרה לבחירת עובד
        </Button>
      </div>
    );
  }

  const canContinue =
    data.status === "READY" ||
    data.status === "PRESENTED" ||
    data.status === "WAITING_REP" ||
    (data.missing?.length ?? 0) === 0;

  return (
    <div className="flex flex-col gap-4">
      <ProfileCard
        conversationId={conversationId}
        profile={data.profile}
        missing={data.missing}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={onBack}>
          חזרה
        </Button>
        <Button type="button" onClick={onContinue} disabled={!canContinue}>
          המשך לאפשרויות
        </Button>
      </div>
      {!canContinue && (
        <p className="text-sm text-muted-foreground" role="status">
          השלימו את הפרטים החסרים בפרופיל לפני המשך.
        </p>
      )}
    </div>
  );
}

function OptionsStage({
  galleryComparison,
  optionsPending,
  optionsError,
  selectingId,
  selectedId,
  compareError,
  onSelectOption,
  onBack,
}: {
  galleryComparison: NonNullable<ReturnType<typeof useConversation>["data"]>["latest_comparison"];
  optionsPending: boolean;
  optionsError: Error | null;
  selectingId: string | null;
  selectedId: string | null;
  compareError: string | null;
  onSelectOption: (optionId: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={onBack}>
          חזרה לפרופיל
        </Button>
      </div>
      {optionsPending && (
        <p className="text-sm text-muted-foreground" aria-busy="true">
          טוען אפשרויות…
        </p>
      )}
      {selectingId && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          מחשבים השוואה…
        </p>
      )}
      {compareError && (
        <p role="alert" className="border border-error-border bg-error-surface px-4 py-2 text-sm text-error">
          {compareError}
        </p>
      )}
      {(optionsError || (!optionsPending && !galleryComparison)) && (
        <p role="alert" className="text-sm text-error">
          {optionsError instanceof OptionsFetchError
            ? optionsError.message
            : optionsError
              ? "טעינת האפשרויות נכשלה. נסו שוב."
              : "אין אפשרויות מהשרת עדיין."}
        </p>
      )}
      {galleryComparison && (
        <OptionsMap
          results={galleryComparison.results}
          bestOptionId={galleryComparison.best_option_id}
          onSelect={onSelectOption}
          selectedId={selectedId}
          selectingId={selectingId}
          className="min-h-0 flex-1"
        />
      )}
    </div>
  );
}

function ComparisonStage({
  loading,
  error,
  comparison,
  selectedOptionId,
  onChangeCar,
  waitingRep,
  openQuestion,
}: {
  loading: boolean;
  error: Error | null;
  comparison: NonNullable<ReturnType<typeof useConversation>["data"]>["latest_comparison"];
  selectedOptionId: string | null;
  onChangeCar: () => void;
  waitingRep: boolean;
  openQuestion: string | null;
}) {
  if (loading) {
    return (
      <p className="text-sm text-muted-foreground" aria-busy="true">
        טוען השוואה…
      </p>
    );
  }

  if (error || !comparison) {
    const message =
      error instanceof ConversationFetchError
        ? error.message
        : "אין השוואה להצגה.";
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm text-error">
          {message}
        </p>
        <Button type="button" variant="outline" onClick={onChangeCar}>
          חזרה לאפשרויות
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {waitingRep && (
        <div
          role="status"
          className="border border-pending-border bg-pending-surface px-4 py-3 text-sm"
        >
          <p className="font-bold">ממתינים לתשובת נציג התחבורה</p>
          {openQuestion && <p className="mt-1">{openQuestion}</p>}
        </div>
      )}
      <ComparisonCard
        comparison={comparison}
        optionId={selectedOptionId}
        onChangeCar={onChangeCar}
      />
    </div>
  );
}
