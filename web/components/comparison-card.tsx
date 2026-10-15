import { ArrowDown, ArrowUp, Check, Clock, Minus } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { WaterfallChart } from "@/components/waterfall-chart";
import type { components } from "@/lib/api/schema";
import { formatDelta, formatShekel } from "@/lib/format";
import { cn } from "@/lib/utils";

type Comparison = components["schemas"]["Comparison"];
type OptionResult = components["schemas"]["OptionResult"];
type ParticipationStatus = components["schemas"]["ParticipationStatus"];
type Profile = components["schemas"]["Profile-Output"];

export type ComparisonCardProps = {
  comparison: Comparison;
  /** Which OptionResult to show; defaults to best_option_id, then first result. */
  optionId?: string | null;
  className?: string;
  /** Tighter padding for embedding inside a chat message bubble. */
  compact?: boolean;
};

function pickResult(comparison: Comparison, optionId?: string | null): OptionResult | null {
  const { results } = comparison;
  if (results.length === 0) return null;
  if (optionId) {
    const match = results.find((r) => r.option.id === optionId);
    if (match) return match;
  }
  if (comparison.best_option_id) {
    const best = results.find((r) => r.option.id === comparison.best_option_id);
    if (best) return best;
  }
  return results[0] ?? null;
}

function todayArrangementLabel(profile: Profile): string {
  const current = profile.current;
  if (!current) return "היום";
  if (current.kind === "waiver") return "ויתור על הרכב";
  const name = [current.vehicle.maker_name, current.vehicle.commercial_name]
    .filter(Boolean)
    .join(" ");
  return name || current.vehicle.commercial_name || "היום";
}

function participationStatusLabel(status: ParticipationStatus): {
  label: string;
  variant: "success" | "pending" | "outline";
} {
  switch (status) {
    case "CONFIRMED":
      return { label: "מאושר", variant: "success" };
    case "DEFAULT_PENDING":
      return { label: "ממתין לנציג", variant: "pending" };
    case "UNKNOWN":
      return { label: "לא ידוע", variant: "outline" };
  }
}

function Money({ amount }: { amount: number }) {
  return (
    <bdi dir="ltr" className="tabular-nums">
      {formatShekel(amount)}
    </bdi>
  );
}

function WaitingValue() {
  return <span className="text-muted-foreground">ממתין לנתונים</span>;
}

function DeltaHero({
  delta,
  estimated,
}: {
  delta: number;
  estimated: boolean;
}) {
  const positive = delta > 0;
  const negative = delta < 0;
  const word = positive ? "יותר" : negative ? "פחות" : "בלי שינוי";
  const Icon = positive ? ArrowUp : negative ? ArrowDown : Minus;

  return (
    <div
      className={cn(
        "border px-4 py-5",
        positive && "border-success-border bg-success-surface",
        negative && "border-error-border bg-error-surface",
        !positive && !negative && "border-border bg-surface-raised",
      )}
    >
      <p className="text-sm font-semibold text-foreground">
        {estimated ? "הפרש נטו חודשי משוער" : "הפרש נטו חודשי"}
      </p>
      <p
        className={cn(
          "mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-display text-4xl font-normal tracking-tight sm:text-5xl",
          positive && "text-success",
          negative && "text-error",
          !positive && !negative && "text-foreground",
        )}
        aria-label={`${formatDelta(delta)} בחודש, ${word}`}
      >
        <span className="inline-flex items-center gap-2">
          <Icon aria-hidden className="size-7 shrink-0 sm:size-8" />
          <bdi dir="ltr">{formatDelta(delta)}</bdi>
        </span>
        <span className="text-lg font-semibold text-foreground sm:text-xl">{word}</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">בחודש</p>
    </div>
  );
}

/**
 * Full comparison card: today vs one alternative.
 * Every requirement-23 field is rendered from OptionResult / Comparison DTOs only.
 */
export function ComparisonCard({
  comparison,
  optionId,
  className,
  compact = false,
}: ComparisonCardProps) {
  const result = pickResult(comparison, optionId);

  if (!result) {
    return (
      <article
        className={cn("border border-border bg-surface px-5 py-6 text-sm text-muted-foreground", className)}
        aria-label="כרטיס השוואה"
      >
        אין תוצאת השוואה להצגה.
      </article>
    );
  }

  const { option, eligibility } = result;
  const eligible = eligibility.eligible;
  const estimated =
    !result.complete || result.participation_status === "DEFAULT_PENDING";
  const todayLabel = todayArrangementLabel(comparison.profile_snapshot);
  const todayVou = comparison.today.value_of_use;
  const waitingRep = result.participation_status === "DEFAULT_PENDING";
  const participationMeta =
    result.participation_status != null
      ? participationStatusLabel(result.participation_status)
      : null;

  return (
    <article
      className={cn(
        "border border-border bg-surface text-foreground",
        compact ? "px-4 py-4" : "px-5 py-6 sm:px-8 sm:py-8",
        className,
      )}
      aria-label={`השוואה: ${option.label}`}
    >
      {/* Header: alternative title + eligibility */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            השוואה חודשית
          </p>
          <h2 className={cn("mt-1 font-display", compact ? "text-xl" : "text-2xl sm:text-3xl")}>
            <bdi>{option.label}</bdi>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            מול <bdi>{todayLabel}</bdi>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {eligible ? (
            <Badge variant="success" className="gap-1">
              <Check aria-hidden data-icon="inline-start" className="size-3.5" />
              זכאי
            </Badge>
          ) : (
            <Badge variant="error">לא זכאי</Badge>
          )}
          {waitingRep && (
            <Badge variant="pending" className="gap-1">
              <Clock aria-hidden data-icon="inline-start" className="size-3.5" />
              ממתין לנציג
            </Badge>
          )}
          {estimated && eligible && (
            <Badge variant="outline">משוערת</Badge>
          )}
        </div>
      </header>

      <p className="mt-3 text-sm" role="status">
        {eligible ? (
          <span className="inline-flex items-start gap-2">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            <span>{eligibility.reason}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{eligibility.reason}</span>
        )}
      </p>

      {/* Today vs alternative columns */}
      <div
        className="mt-5 grid grid-cols-2 gap-3 border border-border"
        role="group"
        aria-label="היום מול החלופה"
      >
        <div className="border-e border-border bg-surface-raised px-3 py-3 sm:px-4">
          <p className="text-xs font-bold text-muted-foreground">היום</p>
          <p className="mt-1 text-sm font-semibold">
            <bdi>{todayLabel}</bdi>
          </p>
        </div>
        <div className="border-s-0 bg-muted/40 px-3 py-3 sm:px-4">
          <p className="text-xs font-bold text-muted-foreground">חלופה</p>
          <p className="mt-1 text-sm font-semibold">
            <bdi>{option.label}</bdi>
          </p>
        </div>
      </div>

      {!eligible ? (
        <p className="mt-5 border border-border bg-surface-raised px-4 py-3 text-sm text-muted-foreground">
          אין תוצאה מספרית לחלופה שאינה מותרת.
        </p>
      ) : (
        <>
          {/* Delta first (dominant) */}
          <div className="mt-5">
            {result.delta != null ? (
              <DeltaHero delta={result.delta} estimated={estimated} />
            ) : (
              <div className="border border-pending-border bg-pending-surface px-4 py-5">
                <p className="text-sm font-semibold">הפרש נטו חודשי</p>
                <p className="mt-2 text-2xl font-bold text-pending">
                  <WaitingValue />
                </p>
              </div>
            )}
          </div>

          {/* Explanation — 2 lines from engine */}
          {result.explanation && result.explanation.length > 0 && (
            <div
              className={cn(
                "mt-4 border-s-4 border-lime bg-surface-raised ps-4 pe-3 py-3",
                compact ? "text-sm" : "text-base",
              )}
            >
              {result.explanation.map((line, i) => (
                <p key={i} className={cn(i > 0 && "mt-1", "leading-relaxed")}>
                  {line}
                </p>
              ))}
            </div>
          )}

          {/* Requirement-23 detail table */}
          <table className="mt-5 w-full border-collapse text-sm">
            <caption className="sr-only">פירוט שדות ההשוואה</caption>
            <tbody>
              <FieldRow label="עלות לחברה ותקציב הקבוצה">
                {result.cost_to_company != null && result.group_budget != null ? (
                  <span>
                    <Money amount={result.cost_to_company} />
                    <span className="text-muted-foreground"> מתוך תקציב </span>
                    <Money amount={result.group_budget} />
                  </span>
                ) : (
                  <WaitingValue />
                )}
              </FieldRow>

              <FieldRow label="השתתפות העובד">
                <span className="inline-flex flex-wrap items-center gap-2">
                  {result.participation != null ? (
                    <Money amount={result.participation} />
                  ) : (
                    <WaitingValue />
                  )}
                  {participationMeta && (
                    <Badge variant={participationMeta.variant} className="gap-1">
                      {participationMeta.variant === "pending" && (
                        <Clock aria-hidden data-icon="inline-start" className="size-3.5" />
                      )}
                      {participationMeta.label}
                    </Badge>
                  )}
                </span>
              </FieldRow>

              <FieldRow label="שווי שימוש">
                {result.value_of_use != null ? (
                  <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Money amount={todayVou} />
                    <span aria-hidden className="text-muted-foreground">
                      →
                    </span>
                    <span className="sr-only">בחלופה </span>
                    <Money amount={result.value_of_use} />
                  </span>
                ) : (
                  <WaitingValue />
                )}
              </FieldRow>

              <FieldRow label="החזר חשמל או אחזקת רכב">
                <ElectricOrMaintenance result={result} />
              </FieldRow>

              <FieldRow label="נטו משוער היום">
                {result.net_today != null ? (
                  <Money amount={result.net_today} />
                ) : (
                  <WaitingValue />
                )}
              </FieldRow>

              <FieldRow label="נטו משוער בחלופה">
                {result.net_option != null ? (
                  <Money amount={result.net_option} />
                ) : (
                  <WaitingValue />
                )}
              </FieldRow>

              <FieldRow label="ההפרש" emphasize>
                {result.delta != null ? (
                  <DeltaInline delta={result.delta} />
                ) : (
                  <WaitingValue />
                )}
              </FieldRow>
            </tbody>
          </table>

          <div className="mt-5">
            <WaterfallChart result={result} compact={compact} />
          </div>
        </>
      )}

      {/* Missing fields when partial */}
      {!result.complete && result.missing && result.missing.length > 0 && (
        <div
          role="status"
          className="mt-5 border border-pending-border bg-pending-surface px-4 py-3 text-sm"
        >
          <p className="font-bold text-pending">חסרים פרטים להשוואה מלאה</p>
          <ul className="mt-2 list-inside list-disc text-foreground">
            {result.missing.map((m) => (
              <li key={m.field}>{m.question}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tax years / transparency */}
      <footer className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
        <p>
          חושב לפי לוחות מס{" "}
          <bdi dir="ltr" className="tabular-nums">
            {comparison.context.payroll_tax_year}
          </bdi>{" "}
          ושווי שימוש{" "}
          <bdi dir="ltr" className="tabular-nums">
            {comparison.context.value_of_use_tax_year}
          </bdi>
          {" · "}
          גרסת כללים {comparison.context.config_version}
        </p>
      </footer>
    </article>
  );
}

function FieldRow({
  label,
  children,
  emphasize = false,
}: {
  label: string;
  children: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <th
        scope="row"
        className={cn(
          "py-3 pe-3 text-start align-top font-medium text-muted-foreground",
          emphasize && "font-semibold text-foreground",
        )}
      >
        {label}
      </th>
      <td
        className={cn(
          "py-3 ps-3 text-start align-top font-semibold",
          emphasize && "text-base",
        )}
      >
        {children}
      </td>
    </tr>
  );
}

function DeltaInline({ delta }: { delta: number }) {
  const positive = delta > 0;
  const negative = delta < 0;
  const word = positive ? "יותר" : negative ? "פחות" : "בלי שינוי";
  const Icon = positive ? ArrowUp : negative ? ArrowDown : Minus;

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-2",
        positive && "text-success",
        negative && "text-error",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <bdi dir="ltr" className="tabular-nums">
        {formatDelta(delta)}
      </bdi>
      <span className="font-medium text-foreground">{word}</span>
    </span>
  );
}

function ElectricOrMaintenance({ result }: { result: OptionResult }) {
  const parts: ReactNode[] = [];

  if (result.electric_refund_net != null) {
    parts.push(
      <span key="electric">
        <bdi dir="ltr" className="tabular-nums">
          {formatDelta(result.electric_refund_net)}
        </bdi>
        {" נטו החזר חשמל"}
      </span>,
    );
  }

  if (result.maintenance != null && result.maintenance !== 0) {
    parts.push(
      <span key="maintenance">
        אחזקת רכב <Money amount={result.maintenance} />
      </span>,
    );
  }

  // Waiver / zero-maintenance explicit when DTO says maintenance is 0 and no electric.
  if (parts.length === 0 && result.maintenance === 0) {
    return (
      <span>
        אחזקת רכב <Money amount={0} />
      </span>
    );
  }

  if (parts.length === 0) {
    return <span className="text-muted-foreground">אין</span>;
  }

  if (parts.length === 1) return parts[0];

  return (
    <span className="flex flex-col gap-1">
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </span>
  );
}
