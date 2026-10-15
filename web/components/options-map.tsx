"use client";

import { Check, Fuel, Leaf, PlugZap, Zap } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { components } from "@/lib/api/schema";
import { formatDelta } from "@/lib/format";
import { cn } from "@/lib/utils";

type OptionResult = components["schemas"]["OptionResult"];
type Drive = components["schemas"]["Drive"];

export type OptionsMapProps = {
  results: OptionResult[];
  /** From Comparison.best_option_id — never computed in the UI. */
  bestOptionId?: string | null;
  onSelect?: (optionId: string) => void;
  selectedId?: string | null;
  /** Option currently being compared (shows Hebrew loading on that card). */
  selectingId?: string | null;
  disabled?: boolean;
  /** Tighter layout for embedding inside a chat message card. */
  compact?: boolean;
  className?: string;
};

/**
 * Gallery of alternatives from an OptionResult list.
 * Only allowed UI logic: sort by delta (eligible first) and the electric filter.
 * "Best" comes solely from Comparison.best_option_id.
 */
export function OptionsMap({
  results,
  bestOptionId = null,
  onSelect,
  selectedId = null,
  selectingId = null,
  disabled = false,
  compact = false,
  className,
}: OptionsMapProps) {
  const filterId = useId();
  const [electricOnly, setElectricOnly] = useState(false);

  const sorted = useMemo(() => sortByDeltaEligibleFirst(results), [results]);

  const visible = useMemo(() => {
    if (!electricOnly) return sorted;
    return sorted.filter((r) => r.option.drive === "ELECTRIC");
  }, [sorted, electricOnly]);

  const countLabel =
    visible.length === 0
      ? "אין חלופות להצגה"
      : visible.length === 1
        ? "מוצגת חלופה אחת"
        : `מוצגות ${visible.length} חלופות`;

  return (
    <section
      aria-label="מפת האפשרויות"
      className={cn("flex min-h-0 flex-col border border-border bg-surface", className)}
    >
      <header
        className={cn(
          "flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border",
          compact ? "px-3 py-2" : "px-4 py-3",
        )}
      >
        <div className="min-w-0">
          <h2 className={cn("font-semibold", compact ? "text-sm" : "text-base")}>
            האפשרויות שלך
          </h2>
          <p className="text-xs text-muted-foreground">
            מסודרות לפי השינוי החודשי בנטו
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label
            htmlFor={filterId}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold"
          >
            <input
              id={filterId}
              type="checkbox"
              checked={electricOnly}
              onChange={(e) => setElectricOnly(e.target.checked)}
              className="size-4 accent-primary border border-input"
            />
            רק חשמליים
          </label>
        </div>
      </header>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {countLabel}
      </p>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          compact ? "p-3" : "p-4",
        )}
      >
        {visible.length === 0 ? (
          <p
            role="status"
            className="border border-border bg-muted px-4 py-8 text-center text-sm text-muted-foreground"
          >
            {electricOnly
              ? "אין חלופות חשמליות להצגה עם הסינון הנוכחי."
              : "אין חלופות מהשרת עדיין."}
          </p>
        ) : (
          <ul
            className={cn(
              "grid gap-3",
              compact
                ? "grid-cols-1"
                : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
            )}
          >
            {visible.map((result) => {
              const id = result.option.id;
              const eligible = result.eligibility.eligible;
              const isBest = bestOptionId != null && id === bestOptionId;
              const selected = selectedId === id;
              const selecting = selectingId === id;
              const interactive = Boolean(onSelect) && !disabled;

              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={!interactive || selectingId != null}
                    aria-pressed={interactive ? selected : undefined}
                    aria-busy={selecting || undefined}
                    onClick={() => onSelect?.(id)}
                    className={cn(
                      "relative flex w-full flex-col gap-2 border border-border bg-background p-4 text-start transition-colors",
                      compact && "p-3",
                      interactive && "hover:bg-muted/80 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      selected && "border-cobalt bg-muted",
                      !eligible && "opacity-70",
                      (!interactive || selectingId != null) && "cursor-default",
                      selectingId != null && !selecting && "opacity-50",
                    )}
                  >
                    {selected && (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 start-0 w-1 bg-cobalt"
                      />
                    )}

                    <span className="flex flex-wrap items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block font-semibold",
                            compact ? "text-sm" : "text-base",
                          )}
                        >
                          <bdi>{result.option.label}</bdi>
                        </span>
                        {result.option.drive ? (
                          <DriveBadge drive={result.option.drive} />
                        ) : result.option.kind === "WAIVER" ? (
                          <span className="mt-1 inline-block text-xs text-muted-foreground">
                            ויתור
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {isBest && (
                          <Badge variant="highlight">הכי משתלם לך</Badge>
                        )}
                        {selected && (
                          <Check aria-hidden className="size-4 text-cobalt" />
                        )}
                      </span>
                    </span>

                    {eligible && result.delta != null ? (
                      <span
                        className={cn(
                          "font-bold tabular-nums",
                          compact ? "text-lg" : "text-2xl",
                          result.delta > 0 && "text-success",
                          result.delta < 0 && "text-error",
                        )}
                      >
                        <bdi dir="ltr">{formatDelta(result.delta)}</bdi>
                        <span className="ms-1 text-xs font-semibold text-muted-foreground">
                          בחודש
                        </span>
                      </span>
                    ) : null}

                    <span className="flex flex-wrap items-center gap-2 text-xs">
                      {eligible ? (
                        <Badge variant="success">זכאי</Badge>
                      ) : (
                        <Badge variant="error">לא זכאי</Badge>
                      )}
                      <span className="text-muted-foreground">
                        {result.eligibility.reason}
                      </span>
                    </span>

                    {selecting && (
                      <span className="text-sm font-medium text-muted-foreground">
                        טוען השוואה…
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Eligible first, then by delta descending; null deltas last within each group. */
export function sortByDeltaEligibleFirst(results: OptionResult[]): OptionResult[] {
  return [...results].sort((a, b) => {
    if (a.eligibility.eligible !== b.eligibility.eligible) {
      return a.eligibility.eligible ? -1 : 1;
    }
    const da = a.delta;
    const db = b.delta;
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return db - da;
  });
}

function DriveBadge({ drive }: { drive: Drive }) {
  const { label, Icon } = driveMeta(drive);
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon aria-hidden className="size-3.5" />
      <span>{label}</span>
    </span>
  );
}

function driveMeta(drive: Drive): {
  label: string;
  Icon: typeof Zap;
} {
  switch (drive) {
    case "PETROL":
      return { label: "בנזין", Icon: Fuel };
    case "HYBRID":
      return { label: "היברידי", Icon: Leaf };
    case "PLUG_IN":
      return { label: "נטען", Icon: PlugZap };
    case "ELECTRIC":
      return { label: "חשמלי", Icon: Zap };
  }
}
