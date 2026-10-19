"use client";

import { Check, Fuel, HandCoins, Leaf, PlugZap, Zap } from "lucide-react";
import Image from "next/image";
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
      className={cn("flex min-h-0 min-w-0 flex-col overflow-x-clip rounded-3xl border border-border/70 bg-surface shadow-card", className)}
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
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 text-sm font-semibold"
          >
            <input
              id={filterId}
              type="checkbox"
              checked={electricOnly}
              onChange={(e) => setElectricOnly(e.target.checked)}
              className="size-11 shrink-0 border border-input accent-primary sm:size-4"
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
            className="rounded-2xl border border-border bg-muted px-4 py-8 text-center text-sm text-muted-foreground"
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
                      "relative flex h-full min-h-11 w-full min-w-0 flex-col gap-2 rounded-2xl border border-border/70 bg-surface p-4 text-start break-words shadow-soft transition-all",
                      compact && "p-3",
                      interactive && "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-card focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0",
                      isBest && "border-success/60",
                      selected && "border-success ring-2 ring-success/30",
                      !eligible && "opacity-70",
                      (!interactive || selectingId != null) && "cursor-default",
                      selectingId != null && !selecting && "opacity-50",
                    )}
                  >
                    {!compact && <VehicleTile drive={result.option.drive ?? null} eligible={eligible} />}

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
                          <Check aria-hidden className="size-4 text-success" />
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

const DRIVE_TONE: Record<Drive, string> = {
  ELECTRIC: "bg-mint",
  HYBRID: "bg-mist",
  PLUG_IN: "bg-[#e6f0fb] dark:bg-[#1d3b52]",
  PETROL: "bg-peach",
};

/** The mockup's car picture, made from the brand car on a tint per drive (no photos - we have none). */
function VehicleTile({ drive, eligible }: { drive: Drive | null; eligible: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-20 items-center justify-center rounded-xl",
        drive ? DRIVE_TONE[drive] : "bg-background",
        !eligible && "grayscale",
      )}
    >
      {drive ? (
        <Image src="/brand/svg/car-silhouette.svg" alt="" width={340} height={175} className="h-14 w-auto" />
      ) : (
        <HandCoins className="size-9 text-success" />
      )}
    </span>
  );
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
