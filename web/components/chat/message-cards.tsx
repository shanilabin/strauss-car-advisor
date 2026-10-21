import { Clock, Star } from "lucide-react";

import type { components } from "@/lib/api/schema";
import { formatDateTime, formatDelta } from "@/lib/format";
import { cn } from "@/lib/utils";

type MessageCard = NonNullable<components["schemas"]["MessageOut"]["cards"]>[number];

type MessageCardViewProps = {
  card: MessageCard;
  onSelectOption?: (optionId: string) => void;
  /** When the rep question was asked, from open_questions or the message timestamp. */
  askedAt?: string;
};

/**
 * Registry keyed by card.kind. Unknown kinds render nothing.
 * Numbers come only from the card DTO — never parsed from bot text.
 */
export function MessageCardView({ card, onSelectOption, askedAt }: MessageCardViewProps) {
  switch (card.kind) {
    // The full comparison is in the middle of the screen - the chat keeps a short summary (QA UX03)
    case "comparison":
      return <ResultSummary comparison={card.comparison} title="ההשוואה" onSelect={onSelectOption} />;
    case "options":
      return <ResultSummary comparison={card.comparison} title="האפשרויות" onSelect={onSelectOption} />;
    case "missing":
      return <MissingMessageCard card={card} />;
    case "rep_pending":
      return <RepPendingMessageCard card={card} askedAt={askedAt} />;
    default:
      return null;
  }
}

const SUMMARY_ROWS = 3;

/** The top alternatives of a comparison in one line each - numbers straight from the DTO. */
function ResultSummary({
  comparison,
  title,
  onSelect,
}: {
  comparison: components["schemas"]["Comparison"];
  title: string;
  onSelect?: (optionId: string) => void;
}) {
  const computed = comparison.results.filter((r) => r.delta != null);
  const rows = (computed.length > 0 ? computed : comparison.results).slice(0, SUMMARY_ROWS);
  const more = comparison.results.length - rows.length;
  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface px-3 py-3">
      <p className="px-1 text-xs font-bold text-muted-foreground">{title}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {rows.map((r) => {
          const row = (
            <>
              <span className="flex min-w-0 flex-1 items-center gap-1.5 font-semibold">
                {r.option.id === comparison.best_option_id && (
                  <Star aria-label="מומלץ" className="size-3.5 shrink-0 fill-current text-success" />
                )}
                <bdi className="truncate">{r.option.label}</bdi>
              </span>
              {r.delta != null ? (
                <bdi
                  dir="ltr"
                  className={cn(
                    "shrink-0 font-extrabold tabular-nums",
                    r.delta > 0 ? "text-success" : r.delta < 0 ? "text-error" : "text-muted-foreground",
                  )}
                >
                  {formatDelta(r.delta)}
                </bdi>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {r.eligibility.eligible ? "ממתין לנתונים" : "לא זכאי"}
                </span>
              )}
            </>
          );
          return (
            <li key={r.option.id}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(r.option.id)}
                  className="flex min-h-9 w-full items-center gap-2 rounded-xl px-1 text-start text-sm hover:bg-mist"
                >
                  {row}
                </button>
              ) : (
                <div className="flex min-h-9 items-center gap-2 px-1 text-sm">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        {more > 0 ? `ועוד ${more}. ` : ""}הפירוט המלא בכרטיס ההשוואה.
      </p>
    </div>
  );
}

function MissingMessageCard({ card }: { card: components["schemas"]["MissingCard"] }) {
  return (
    <div className="rounded-2xl mt-3 border border-border bg-surface px-4 py-3">
      <p className="text-xs font-bold text-muted-foreground">חסרים פרטים</p>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
        {card.missing.map((m) => (
          <li key={m.field}>{m.question}</li>
        ))}
      </ul>
    </div>
  );
}

/** "The transport rep was asked" - once per message, however many questions were opened. */
export function RepPendingSummary({ count }: { count: number }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-2xl border border-pending-border bg-pending-surface px-4 py-2.5 text-sm">
      <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-pending" />
      <span>
        <span className="font-bold text-pending">נשלח לנציג התחבורה.</span>{" "}
        {count > 1 ? `ההשתתפות בחלק מהרכבים מחכה לאישור שלו.` : "ההשתתפות ברכב מחכה לאישור שלו."} ההשוואה
        תתעדכן כאן לבד כשיענה.
      </span>
    </p>
  );
}

function RepPendingMessageCard({
  card,
  askedAt,
}: {
  card: components["schemas"]["RepPendingCard"];
  askedAt?: string;
}) {
  return (
    <div className="rounded-2xl mt-3 border border-pending-border bg-pending-surface px-4 py-3">
      <p className="flex items-center gap-2 text-xs font-bold text-pending">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-pending motion-safe:animate-pulse"
        />
        <Clock aria-hidden className="size-3.5" />
        ממתין לנציג
      </p>
      <p className="mt-2 text-sm text-foreground">{card.question}</p>
      {askedAt && (
        <time
          dateTime={askedAt}
          className="mt-1 block text-xs text-muted-foreground tabular-nums"
        >
          נשאל ב-{formatDateTime(askedAt)}
        </time>
      )}
    </div>
  );
}
