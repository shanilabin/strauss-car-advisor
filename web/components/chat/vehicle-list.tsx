"use client";

import { Ban, ChevronLeft, ChevronRight, Star, TrendingDown, TrendingUp } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { carImage } from "@/lib/car-images";
import { formatDelta } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api/schema";

type OptionResult = components["schemas"]["OptionResult"];
type Drive = components["schemas"]["Drive"];

type VehicleListProps = {
  results: OptionResult[];
  selectedId: string | null;
  /** The engine's best option (Comparison.best_option_id), marked as recommended. */
  bestOptionId?: string | null;
  onSelect: (optionId: string) => void;
  /** Desktop rail uses 260/320px; fluid fills the mobile sheet. */
  fluid?: boolean;
  className?: string;
};

/** The alternatives on screen as cards, the engine's best one marked, ineligible ones dimmed. */
export function VehicleList({
  results,
  selectedId,
  bestOptionId = null,
  onSelect,
  fluid = false,
  className,
}: VehicleListProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      aria-label="רשימת חלופות"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-card transition-[width] duration-300 ease-out motion-reduce:transition-none",
        fluid ? "w-full" : expanded ? "w-[320px]" : "w-[270px]",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="text-base font-extrabold whitespace-nowrap">החלופות שנבדקו</h2>
        <span className="flex items-center gap-1">
          <span className="rounded-full bg-mist px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-primary">
            {results.length} תוצאות
          </span>
          {!fluid && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex size-9 items-center justify-center rounded-full text-link hover:bg-mist pointer-coarse:size-11"
              aria-expanded={expanded}
            >
              <span className="sr-only">{expanded ? "צמצום הרשימה" : "הרחבת הרשימה"}</span>
              {expanded ? (
                <ChevronRight aria-hidden className="size-4 rtl:rotate-180" />
              ) : (
                <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />
              )}
            </button>
          )}
        </span>
      </header>

      <BestNote results={results} bestOptionId={bestOptionId} />

      {results.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">אין חלופות מהשרת עדיין.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
          {results.map((result) => {
            const selected = result.option.id === selectedId;
            const eligible = result.eligibility.eligible;
            const best = result.option.id === bestOptionId;
            const delta = eligible ? result.delta : null;
            const photo = carImage(result.option.catalog_id);
            return (
              <li key={result.option.id}>
                <button
                  type="button"
                  onClick={() => onSelect(result.option.id)}
                  aria-pressed={selected}
                  className={cn(
                    "relative flex w-full min-w-0 items-center gap-3 rounded-2xl border bg-surface px-3 py-3 text-start break-words shadow-soft transition-all",
                    selected ? "border-success ring-2 ring-success/30" : "border-border/70 hover:border-primary/50",
                    !eligible && "bg-background opacity-75 shadow-none",
                  )}
                >
                  {photo && (
                    <span className="relative h-10 w-16 shrink-0" title={`תמונה להמחשה · מקור: ${photo.credit}`}>
                      <Image src={photo.src} alt="" fill sizes="64px" className={cn("object-contain", !eligible && "grayscale")} />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {best && (
                      <span className="mb-1 inline-flex w-fit items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[0.7rem] font-bold text-white dark:text-[#102632]">
                        <Star aria-hidden className="size-3 fill-current" />
                        מומלץ
                      </span>
                    )}
                    <span className="text-sm font-extrabold">
                      <bdi>{result.option.label}</bdi>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {result.option.drive ? driveLabel(result.option.drive) : "בלי רכב"}
                      {!eligible && " · לא זכאי"}
                    </span>
                    {!eligible && (expanded || fluid) && (
                      <span className="mt-1 text-xs text-muted-foreground">{result.eligibility.reason}</span>
                    )}
                  </span>
                  {delta != null ? (
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-sm font-extrabold",
                        delta >= 0 ? "bg-success-surface text-success" : "bg-error-surface text-error",
                      )}
                    >
                      <bdi dir="ltr">{formatDelta(delta)}</bdi>
                      {delta >= 0 ? (
                        <TrendingUp aria-hidden className="size-4" />
                      ) : (
                        <TrendingDown aria-hidden className="size-4" />
                      )}
                    </span>
                  ) : !eligible ? (
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-muted-foreground">
                      <Ban aria-hidden className="size-4" />
                    </span>
                  ) : null}
                  <ChevronLeft aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:rotate-0 ltr:rotate-180" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

/**
 * The engine's best option is measured against every alternative and today (QA UX02), so say when
 * staying as today wins, or when the winner is not among the alternatives on screen (QA B03).
 */
function BestNote({ results, bestOptionId }: { results: OptionResult[]; bestOptionId: string | null }) {
  if (!results.some((r) => r.delta != null)) return null;
  const text =
    bestOptionId == null
      ? "לנטו, המצב של היום עדיף: אף חלופה לא משאירה יותר."
      : results.some((r) => r.option.id === bestOptionId)
        ? null
        : "ברשימה המלאה יש חלופה שמשאירה יותר בנטו. אפשר לראות אותה ב\"החלף רכב\"."
  if (!text) return null;
  return <p className="mx-3 mb-1 rounded-2xl bg-mist px-3 py-2 text-xs font-semibold text-primary">{text}</p>;
}

function driveLabel(drive: Drive): string {
  switch (drive) {
    case "PETROL":
      return "בנזין";
    case "HYBRID":
      return "היברידי";
    case "PLUG_IN":
      return "נטען";
    case "ELECTRIC":
      return "חשמלי";
  }
}
