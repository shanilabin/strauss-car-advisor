import { Clock } from "lucide-react";

import { ComparisonCard } from "@/components/comparison-card";
import { OptionsMap } from "@/components/options-map";
import type { components } from "@/lib/api/schema";
import { formatDateTime } from "@/lib/format";

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
      return (
        <OptionsMap
          results={card.comparison.results}
          bestOptionId={card.comparison.best_option_id}
          onSelect={onSelectOption}
          compact
          className="mt-3"
        />
      );
    case "missing":
      return <MissingMessageCard card={card} />;
    case "rep_pending":
      return <RepPendingMessageCard card={card} askedAt={askedAt} />;
    default:
      return null;
  }
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
