import { Clock, ListChecks, Scale } from "lucide-react";

import { formatDelta, formatShekel } from "@/lib/format";
import type { components } from "@/lib/api/schema";

type MessageCard = NonNullable<components["schemas"]["MessageOut"]["cards"]>[number];

/**
 * Registry keyed by card.kind. Unknown kinds render nothing.
 * Numbers come only from the card DTO — never parsed from bot text.
 */
export function MessageCardView({ card }: { card: MessageCard }) {
  switch (card.kind) {
    case "comparison":
      return <ComparisonMessageCard card={card} />;
    case "options":
      return <OptionsMessageCard card={card} />;
    case "missing":
      return <MissingMessageCard card={card} />;
    case "rep_pending":
      return <RepPendingMessageCard card={card} />;
    default:
      return null;
  }
}

function ComparisonMessageCard({
  card,
}: {
  card: components["schemas"]["ComparisonCard"];
}) {
  const results = card.comparison.results;
  const bestId = card.comparison.best_option_id;
  const best = results.find((r) => r.option.id === bestId) ?? results[0];
  if (!best) {
    return (
      <div className="mt-3 border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
        כרטיס השוואה — אין תוצאות להצגה
      </div>
    );
  }

  return (
    <div className="mt-3 border border-border bg-surface px-4 py-3">
      <p className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <Scale aria-hidden className="size-3.5" />
        השוואה
      </p>
      <p className="mt-2 font-semibold">
        <bdi>{best.option.label}</bdi>
      </p>
      {best.eligibility.eligible && best.delta != null ? (
        <p className="mt-1 text-2xl font-black">
          <bdi dir="ltr">{formatDelta(best.delta)}</bdi>
          <span className="ms-2 text-sm font-semibold text-muted-foreground">הפרש נטו חודשי</span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{best.eligibility.reason}</p>
      )}
      {best.net_today != null && best.net_option != null && (
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">נטו היום</dt>
            <dd className="font-bold">
              <bdi dir="ltr">{formatShekel(best.net_today)}</bdi>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">נטו בחלופה</dt>
            <dd className="font-bold">
              <bdi dir="ltr">{formatShekel(best.net_option)}</bdi>
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function OptionsMessageCard({ card }: { card: components["schemas"]["OptionsCard"] }) {
  const results = card.comparison.results;
  const eligible = results.filter((r) => r.eligibility.eligible);

  return (
    <div className="mt-3 border border-border bg-surface px-4 py-3">
      <p className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <ListChecks aria-hidden className="size-3.5" />
        אפשרויות
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {eligible.slice(0, 3).map((r) => (
          <li key={r.option.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 font-medium">
              <bdi>{r.option.label}</bdi>
            </span>
            {r.delta != null ? (
              <span className="shrink-0 font-bold">
                <bdi dir="ltr">{formatDelta(r.delta)}</bdi>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {results.length > 3 && (
        <p className="mt-2 text-xs text-muted-foreground">ועוד {results.length - 3} חלופות במפה</p>
      )}
    </div>
  );
}

function MissingMessageCard({ card }: { card: components["schemas"]["MissingCard"] }) {
  return (
    <div className="mt-3 border border-border bg-surface px-4 py-3">
      <p className="text-xs font-bold text-muted-foreground">חסרים פרטים</p>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
        {card.missing.map((m) => (
          <li key={m.field}>{m.question}</li>
        ))}
      </ul>
    </div>
  );
}

function RepPendingMessageCard({ card }: { card: components["schemas"]["RepPendingCard"] }) {
  return (
    <div className="mt-3 border border-pending-border bg-pending-surface px-4 py-3 text-pending">
      <p className="flex items-center gap-2 text-xs font-bold">
        <Clock aria-hidden className="size-3.5" />
        ממתין לנציג
      </p>
      <p className="mt-2 text-sm text-foreground">{card.question}</p>
    </div>
  );
}
