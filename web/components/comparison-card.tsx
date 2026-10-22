import {
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarCheck,
  CarFront,
  Check,
  Clock,
  Info,
  type LucideIcon,
  Minus,
  RefreshCw,
  Scale,
  Send,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WaterfallChart } from "@/components/waterfall-chart";
import { WhyPopover } from "@/components/why-popover";
import { findSourceByField } from "@/lib/api/resolve-source-value";
import type { components } from "@/lib/api/schema";
import { carImage } from "@/lib/car-images";
import { formatDelta, formatShekel } from "@/lib/format";
import { cn } from "@/lib/utils";

type Comparison = components["schemas"]["Comparison"];
type OptionResult = components["schemas"]["OptionResult"];
type ParticipationStatus = components["schemas"]["ParticipationStatus"];
type Profile = components["schemas"]["Profile-Output"];
type Source = components["schemas"]["Source"];

export type ComparisonCardProps = {
  comparison: Comparison;
  /** Which OptionResult to show; defaults to best_option_id, then first result. */
  optionId?: string | null;
  className?: string;
  /** Tighter padding for embedding inside a chat message bubble. */
  compact?: boolean;
  /** Return to the options gallery to pick another car and re-run compare. */
  onChangeCar?: () => void;
  /**
   * "I want this car": asks the transport rep to confirm a default participation. The rep is never asked
   * by a mere comparison - until then the numbers are an estimate. Absent -> no button (e.g. in the chat).
   */
  rep?: {
    /** Open rep question fields of the conversation ("participation:CAR-10"). */
    askedFields: readonly string[];
    onRequest: (optionId: string) => void;
    requesting: boolean;
    error: string | null;
  };
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

export function todayArrangementLabel(profile: Profile): string {
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
      return { label: "הערכה", variant: "outline" };
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

function Why({
  sources,
  field,
  fieldValue,
  fieldLabel,
}: {
  sources: Source[] | undefined;
  field: string;
  fieldValue?: number | null;
  fieldLabel: string;
}) {
  const source = findSourceByField(sources, field);
  if (!source) return null;
  return (
    <WhyPopover
      source={source}
      fieldValue={fieldValue}
      fieldLabel={fieldLabel}
    />
  );
}

/**
 * "When does this change?" - the participation at which this car leaves exactly today's net. The amount
 * comes from the engine, which verified it by recomputing the option at it (OptionResult.break_even).
 */
function BreakEven({ amount, delta, pending }: { amount: number; delta: number; pending: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-[0.95rem]">
      <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        <Scale aria-hidden className="size-4" />
        מתי זה משתנה?
      </p>
      <p className="mt-1 leading-relaxed">
        {delta > 0 ? (
          <>
            החלופה משתלמת כל עוד ההשתתפות בה היא עד <Money amount={amount} /> בחודש. מעל זה, המצב של היום
            משאיר יותר בנטו.
          </>
        ) : (
          <>
            החלופה תשתלם רק אם ההשתתפות בה תרד מתחת ל-<Money amount={amount} /> בחודש.
          </>
        )}
        {pending && <span className="text-muted-foreground"> שימו לב: ההשתתפות היא הערכה עד אישור הנציג.</span>}
      </p>
    </div>
  );
}

/**
 * The participation is the catalog default - an estimate. The employee who wants this car asks the
 * transport rep to confirm it; once asked, the card says it is waiting (the comparison updates by itself).
 */
function RepRequest({
  optionId,
  waiting,
  onRequest,
  requesting,
  error,
}: {
  optionId: string;
  waiting: boolean;
  onRequest: (optionId: string) => void;
  requesting: boolean;
  error: string | null;
}) {
  if (waiting) {
    return (
      <p role="status" className="mt-4 flex items-start gap-2 rounded-2xl border border-pending-border bg-pending-surface px-3 py-2 text-sm">
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-pending" />
        <span>
          <span className="font-bold">נשלח לנציג התחבורה.</span> כשיאשר את ההשתתפות, ההשוואה תתעדכן כאן לבד.
        </span>
      </p>
    );
  }
  return (
    <div className="mt-4 flex flex-col gap-1.5 rounded-2xl bg-surface/70 p-3 ring-1 ring-border/70">
      <p className="text-sm">
        <span className="font-bold">רוצה את הרכב הזה?</span> ההשתתפות כאן היא הערכה לפי הקטלוג. נציג התחבורה יאשר את
        הסכום שלך.
      </p>
      <Button type="button" size="sm" onClick={() => onRequest(optionId)} disabled={requesting} className="self-start">
        <Send aria-hidden data-icon="inline-start" className="rtl:-scale-x-100" />
        {requesting ? "שולח…" : "בקשת אישור מהנציג"}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-error">
          {error}
        </p>
      )}
    </div>
  );
}

function WaitingValue() {
  return <span className="text-muted-foreground">ממתין לנתונים</span>;
}

/** A field that does not exist for this alternative (no company car after a waiver) - not "missing". */
function NotApplicable({ children }: { children: ReactNode }) {
  return <span className="font-normal text-muted-foreground">{children}</span>;
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
        // a size container: the number below scales with this box, not the screen, so it always fits
        "@container rounded-2xl px-5 py-6 text-center",
        positive && "bg-success-surface ring-1 ring-success-border",
        negative && "bg-error-surface ring-1 ring-error-border",
        !positive && !negative && "bg-surface-raised ring-1 ring-border",
      )}
    >
      <p
        className={cn(
          "flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[clamp(2rem,18cqi,3.75rem)] font-black tracking-tight break-words",
          positive && "text-success",
          negative && "text-error",
          !positive && !negative && "text-foreground",
        )}
        aria-label={`${formatDelta(delta)} בחודש, ${word}`}
      >
        <bdi dir="ltr">{formatDelta(delta)}</bdi>
        <Icon aria-hidden className="size-[0.6em] shrink-0" strokeWidth={2.6} />
      </p>
      <p className="mt-2 text-base font-bold text-foreground">
        {estimated ? "הפרש נטו חודשי משוער" : "הפרש נטו חודשי"}
        <span className="font-semibold text-muted-foreground"> · {word} בכל חודש</span>
      </p>
    </div>
  );
}

export function ComparisonCard({
  comparison,
  optionId,
  className,
  compact = false,
  onChangeCar,
  rep,
}: ComparisonCardProps) {
  const result = pickResult(comparison, optionId);

  if (!result) {
    return (
      <article
        className={cn("rounded-3xl border border-border bg-surface px-5 py-6 text-sm text-muted-foreground", className)}
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
  // A default participation is an estimate; "waiting for the rep" only once the employee asked for it
  const defaultParticipation = result.participation_status === "DEFAULT_PENDING";
  const waitingRep = defaultParticipation && (rep?.askedFields.includes(`participation:${option.id}`) ?? false);
  const isBest = comparison.best_option_id === option.id;
  const photo = carImage(option.catalog_id);
  // A computed waiver has no car: its car fields are "not applicable", shown from the engine's breakdown
  const waiverDone = option.kind === "WAIVER" && result.delta != null;
  // The family track's share is charged on top of the participation (QA UX05: show it, don't hide it)
  const trackShare = result.breakdown?.track_employee_share ?? null;
  const participationMeta =
    result.participation_status != null
      ? participationStatusLabel(result.participation_status)
      : null;

  return (
    <article
      className={cn(
        "min-w-0 max-w-full overflow-x-clip rounded-3xl border border-border/70 bg-surface text-foreground shadow-card",
        compact ? "p-4" : "p-4 sm:p-6 lg:p-7",
        className,
      )}
      aria-label={`השוואה: ${option.label}`}
    >
      <div className={cn("grid gap-4", !compact && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6")}>
        {/* The alternative: name, drive, eligibility (no photo - the brand car stands in) */}
        <section aria-label="החלופה" className="relative isolate flex min-w-0 flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-mist to-surface p-5 ring-1 ring-border/70">
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
            {estimated && eligible && <Badge variant="outline">משוערת</Badge>}
          </div>
          {!compact &&
            (photo ? (
              <figure className="mx-auto my-3 w-full max-w-80">
                <Image
                  src={photo.src}
                  alt={`${option.label} (תמונה להמחשה)`}
                  width={photo.width}
                  height={photo.height}
                  sizes="(min-width: 1024px) 320px, 80vw"
                  className={cn("mx-auto h-auto max-h-44 w-auto object-contain", !eligible && "grayscale")}
                />
                <figcaption className="mt-1 text-center text-[0.7rem] text-muted-foreground">
                  תמונה להמחשה · מקור: <bdi dir="ltr">{photo.credit}</bdi>
                </figcaption>
              </figure>
            ) : (
              <Image
                src="/brand/svg/car-silhouette.svg"
                alt=""
                width={340}
                height={175}
                className="mx-auto my-3 h-auto w-[70%] max-w-64 drop-shadow-[0_14px_12px_rgb(23_50_72/0.15)]"
              />
            ))}
          <h2 className={cn("font-extrabold break-words", compact ? "mt-3 text-xl" : "text-2xl lg:text-3xl")}>
            <bdi>{option.label}</bdi>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            מול <bdi>{todayLabel}</bdi>
          </p>
          <p className="mt-3 flex items-start gap-2 text-sm" role="status">
            {eligible && <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />}
            <span className={cn(!eligible && "text-muted-foreground")}>{eligibility.reason}</span>
            <Why sources={result.sources} field="eligibility" fieldLabel="זכאות" />
          </p>
          {onChangeCar && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onChangeCar}
              aria-label="החלף רכב — חזרה לגלריית האפשרויות"
              className="mt-4 self-start"
            >
              <RefreshCw aria-hidden data-icon="inline-start" />
              החלף רכב
            </Button>
          )}
          {rep && eligible && defaultParticipation && (
            <RepRequest
              optionId={option.id}
              waiting={waitingRep}
              onRequest={rep.onRequest}
              requesting={rep.requesting}
              error={rep.error}
            />
          )}
        </section>

        {/* The answer: monthly net delta first, then today and the alternative */}
        <section aria-label="ההפרש בנטו" className="flex min-w-0 flex-col gap-3">
          {isBest && eligible && !compact && (
            <p className="inline-flex items-center gap-2 self-start rounded-full bg-success px-4 py-1.5 text-sm font-bold text-white shadow-soft dark:text-[#102632]">
              <Star aria-hidden className="size-4 fill-current" />
              {/* A best built on a default participation is said to be an estimate until the rep confirms */}
              {defaultParticipation ? "המשתלמת ביותר לפי הערכה, עד אישור הנציג" : "החלופה המשתלמת ביותר עבורך"}
            </p>
          )}
          {!eligible ? (
            <p className="rounded-2xl border border-border bg-surface-raised px-4 py-5 text-sm text-muted-foreground">
              אין תוצאה מספרית לחלופה שאינה מותרת.
            </p>
          ) : result.delta != null ? (
            <div className="relative">
              <DeltaHero delta={result.delta} estimated={estimated} />
              <div className="absolute top-3 end-3">
                <Why sources={result.sources} field="delta" fieldValue={result.delta} fieldLabel="הפרש נטו" />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-pending-border bg-pending-surface px-4 py-5">
              <p className="text-sm font-semibold">הפרש נטו חודשי</p>
              <p className="mt-2 text-2xl font-bold text-pending">
                <WaitingValue />
              </p>
            </div>
          )}

          {eligible && (
            <dl className="grid grid-cols-2 gap-3">
              <NetTile label="נטו היום" tone="bg-mist">
                {result.net_today != null ? (
                  <span className="inline-flex items-center">
                    <Money amount={result.net_today} />
                    <Why sources={result.sources} field="net_today" fieldValue={result.net_today} fieldLabel="נטו היום" />
                  </span>
                ) : (
                  <WaitingValue />
                )}
              </NetTile>
              <NetTile label="נטו בחלופה" tone="bg-mint">
                {result.net_option != null ? (
                  <span className="inline-flex items-center">
                    <Money amount={result.net_option} />
                    <Why sources={result.sources} field="net_option" fieldValue={result.net_option} fieldLabel="נטו בחלופה" />
                  </span>
                ) : (
                  <WaitingValue />
                )}
              </NetTile>
            </dl>
          )}

          {eligible && result.explanation && result.explanation.length > 0 && (
            <div
              className={cn(
                "rounded-2xl border-s-4 border-success bg-success-surface px-4 py-3 text-foreground",
                compact ? "text-sm" : "text-[0.95rem]",
              )}
            >
              {result.explanation.map((line, i) => (
                <p key={i} className={cn(i > 0 && "mt-1", "leading-relaxed")}>
                  {line}
                </p>
              ))}
            </div>
          )}
          {eligible && result.break_even_participation != null && result.delta != null && result.delta !== 0 && (
            <BreakEven amount={result.break_even_participation} delta={result.delta} pending={defaultParticipation} />
          )}
        </section>
      </div>

      {eligible && (
        <>
          {/* How we got to the delta */}
          <section aria-label="איך הגענו להפרש" className="mt-6 rounded-2xl border border-border/70 p-4 sm:p-5">
            <h3 className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
              <Info aria-hidden className="size-5 text-primary" />
              איך הגענו להפרש
              {result.delta != null && (
                <>
                  {" של "}
                  <bdi dir="ltr" className={cn(result.delta > 0 ? "text-success" : result.delta < 0 ? "text-error" : "")}>
                    {formatDelta(result.delta)}
                  </bdi>
                  ?
                </>
              )}
            </h3>
            <WaterfallChart result={result} compact={compact} />
          </section>

          {/* Requirement 23: every field, from the DTO. A real table (rows keep their names), laid out as tiles. */}
          <p className="mt-4 text-xs text-muted-foreground">
            כל המספרים כאן מחושבים במנוע החישוב של החברה. ליד מספר יש <span className="font-bold">למה?</span>:
            לחצו כדי לראות מאיפה הוא מגיע.
          </p>
          <table className="mt-2 block w-full text-sm">
            <caption className="sr-only">פירוט שדות ההשוואה</caption>
            <tbody className={cn("grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
              <FactRow icon={Building2} label="עלות לחברה ותקציב הקבוצה">
                {result.cost_to_company != null && result.group_budget != null ? (
                  <span className="inline-flex flex-wrap items-center gap-x-1">
                    <Money amount={result.cost_to_company} />
                    <Why sources={result.sources} field="cost_to_company" fieldValue={result.cost_to_company} fieldLabel="עלות לחברה" />
                    <span className="font-normal text-muted-foreground">מתוך תקציב</span>
                    <Money amount={result.group_budget} />
                    <Why sources={result.sources} field="group_budget" fieldValue={result.group_budget} fieldLabel="תקציב הקבוצה" />
                  </span>
                ) : waiverDone ? (
                  <NotApplicable>לא חל: אין רכב חברה</NotApplicable>
                ) : (
                  <WaitingValue />
                )}
              </FactRow>

              <FactRow icon={Wallet} label="השתתפות העובד">
                <span className="inline-flex flex-wrap items-center gap-2">
                  {result.participation != null ? (
                    <span className="inline-flex items-center">
                      <Money amount={result.participation} />
                      <Why sources={result.sources} field="participation" fieldValue={result.participation} fieldLabel="השתתפות העובד" />
                    </span>
                  ) : waiverDone && result.breakdown ? (
                    <span className="inline-flex flex-wrap items-baseline gap-x-2">
                      <Money amount={result.breakdown.participation} />
                      <NotApplicable>אין רכב, אין השתתפות</NotApplicable>
                    </span>
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
              </FactRow>

              {trackShare != null && trackShare > 0 && (
                <FactRow icon={Users} label="חלק העובד במסלול">
                  <span className="inline-flex flex-wrap items-center gap-x-2">
                    <span className="inline-flex items-center">
                      <Money amount={trackShare} />
                      <Why sources={result.sources} field="track_employee_share" fieldValue={trackShare} fieldLabel="חלק העובד במסלול" />
                    </span>
                    <NotApplicable>בנוסף להשתתפות, יורד מהנטו בכל חודש</NotApplicable>
                  </span>
                </FactRow>
              )}

              <FactRow icon={CarFront} label="שווי שימוש">
                {result.value_of_use != null || (waiverDone && result.breakdown) ? (
                  <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Money amount={todayVou} />
                    <span aria-hidden className="text-muted-foreground">
                      ←
                    </span>
                    <span className="sr-only">בחלופה </span>
                    {result.value_of_use != null ? (
                      <span className="inline-flex items-center">
                        <Money amount={result.value_of_use} />
                        <Why sources={result.sources} field="value_of_use" fieldValue={result.value_of_use} fieldLabel="שווי שימוש" />
                      </span>
                    ) : (
                      <span className="inline-flex items-baseline gap-x-2">
                        <Money amount={result.breakdown?.value_of_use ?? 0} />
                        <NotApplicable>אין רכב, אין שווי שימוש</NotApplicable>
                      </span>
                    )}
                  </span>
                ) : (
                  <WaitingValue />
                )}
              </FactRow>

              <FactRow icon={Zap} label="החזר חשמל או אחזקת רכב">
                <ElectricOrMaintenance result={result} />
              </FactRow>

              <FactRow icon={CalendarCheck} label="נטו משוער היום">
                {result.net_today != null ? (
                  <span className="inline-flex items-center">
                    <Money amount={result.net_today} />
                    <Why sources={result.sources} field="net_today" fieldValue={result.net_today} fieldLabel="נטו היום" />
                  </span>
                ) : (
                  <WaitingValue />
                )}
              </FactRow>

              <FactRow icon={Sparkles} label="נטו משוער בחלופה">
                {result.net_option != null ? (
                  <span className="inline-flex items-center">
                    <Money amount={result.net_option} />
                    <Why sources={result.sources} field="net_option" fieldValue={result.net_option} fieldLabel="נטו בחלופה" />
                  </span>
                ) : (
                  <WaitingValue />
                )}
              </FactRow>

              <FactRow icon={TrendingUp} label="ההפרש" wide={!compact}>
                {result.delta != null ? (
                  <span className="inline-flex items-center">
                    <DeltaInline delta={result.delta} />
                    <Why sources={result.sources} field="delta" fieldValue={result.delta} fieldLabel="ההפרש" />
                  </span>
                ) : (
                  <WaitingValue />
                )}
              </FactRow>
            </tbody>
          </table>
        </>
      )}

      {/* Missing fields when partial */}
      {!result.complete && result.missing && result.missing.length > 0 && (
        <div
          role="status"
          className="mt-5 rounded-2xl border border-pending-border bg-pending-surface px-4 py-3 text-sm"
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
      <footer className="mt-5 border-t border-border/70 pt-3 text-xs break-words text-muted-foreground">
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

function NetTile({ label, tone, children }: { label: string; tone: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl px-4 py-3 text-center", tone)}>
      <dt className="text-sm font-semibold text-foreground/80">{label}</dt>
      <dd className="mt-1 text-xl font-extrabold tabular-nums sm:text-2xl">{children}</dd>
    </div>
  );
}

function FactRow({
  icon: Icon,
  label,
  wide = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <tr className={cn("flex min-w-0 items-start gap-3 rounded-2xl bg-background px-4 py-3", wide && "sm:col-span-2")}>
      <td aria-hidden className="shrink-0">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-mist text-primary">
          <Icon className="size-4.5" />
        </span>
      </td>
      <th scope="row" className="sr-only">
        {label}
      </th>
      <td className="min-w-0">
        <span aria-hidden className="block text-xs font-semibold text-muted-foreground">
          {label}
        </span>
        <span className="mt-0.5 block text-sm font-bold break-words">{children}</span>
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
      <span key="electric" className="inline-flex items-center">
        <bdi dir="ltr" className="tabular-nums">
          {formatDelta(result.electric_refund_net)}
        </bdi>
        {" נטו החזר חשמל"}
        <Why
          sources={result.sources}
          field="electric_refund_net"
          fieldValue={result.electric_refund_net}
          fieldLabel="החזר חשמל"
        />
      </span>,
    );
  }

  if (result.maintenance != null && result.maintenance !== 0) {
    parts.push(
      <span key="maintenance" className="inline-flex items-center">
        אחזקת רכב <Money amount={result.maintenance} />
        <Why
          sources={result.sources}
          field="maintenance"
          fieldValue={result.maintenance}
          fieldLabel="אחזקת רכב"
        />
      </span>,
    );
  }

  // Waiver / zero-maintenance explicit when DTO says maintenance is 0 and no electric.
  if (parts.length === 0 && result.maintenance === 0) {
    return (
      <span className="inline-flex items-center">
        אחזקת רכב <Money amount={0} />
        <Why
          sources={result.sources}
          field="maintenance"
          fieldValue={0}
          fieldLabel="אחזקת רכב"
        />
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
