import { Clock, ListChecks } from "lucide-react";

import { ComparisonCard } from "@/components/comparison-card";
import { formatDelta } from "@/lib/format";
import type { components } from "@/lib/api/schema";

type MessageCard = NonNullable<components["schemas"]["MessageOut"]["cards"]>[number];

/**
 * Registry keyed by card.kind. Unknown kinds render nothing.
 * Numbers come only from the card DTO — never parsed from bot text.
 */
export function MessageCardView({ card }: { card: MessageCard }) {
  switch (card.kind) {
    case "comparison":
      return (
        <ComparisonCard
          comparison={card.comparison}
          optionId={card.comparison.best_option_id}
          compact
          className="mt-3"
        />
      );
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
