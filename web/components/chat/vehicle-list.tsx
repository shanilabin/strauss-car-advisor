"use client";

import { Check, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { useState } from "react";

import { formatDelta } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api/schema";

type OptionResult = components["schemas"]["OptionResult"];
type Drive = components["schemas"]["Drive"];

type VehicleListProps = {
  results: OptionResult[];
  selectedId: string | null;
  onSelect: (optionId: string) => void;
  /** Desktop rail uses 200/280px; fluid fills the mobile sheet. */
  fluid?: boolean;
  className?: string;
};

/** Compact vehicle list for comparison phase — 200px default, expands to 280px. */
export function VehicleList({
  results,
  selectedId,
  onSelect,
  fluid = false,
  className,
}: VehicleListProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      aria-label="רשימת חלופות"
      className={cn(
        "flex min-h-0 flex-col border border-border bg-surface transition-[width] duration-300 ease-out motion-reduce:transition-none",
        fluid ? "w-full" : expanded ? "w-[280px]" : "w-[200px]",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-3">
        <h2 className="text-sm font-semibold">חלופות</h2>
        {!fluid && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm font-semibold text-link hover:underline"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <span className="sr-only">צמצום הרשימה</span>
                <ChevronRight aria-hidden className="size-4 rtl:rotate-180" />
              </>
            ) : (
              <>
                <span className="sr-only">הרחבת הרשימה</span>
                <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />
              </>
            )}
          </button>
        )}
      </header>

      {results.length === 0 ? (
        <p className="px-3 py-6 text-sm text-muted-foreground">אין חלופות מהשרת עדיין.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          {results.map((result) => {
            const selected = result.option.id === selectedId;
            const eligible = result.eligibility.eligible;
            return (
              <li key={result.option.id}>
                <button
                  type="button"
                  onClick={() => onSelect(result.option.id)}
                  aria-pressed={selected}
                  className={cn(
                    "relative flex min-h-11 w-full min-w-0 flex-col gap-1 border border-transparent px-3 py-3 text-start break-words transition-colors",
                    selected && "border-border bg-muted",
                    !eligible && "opacity-60",
                    "hover:bg-muted/80",
                  )}
                >
                  {selected && (
                    <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-cobalt" />
                  )}
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-sm font-semibold">
                      <bdi>{result.option.label}</bdi>
                    </span>
                    {selected && <Check aria-hidden className="size-4 shrink-0 text-cobalt" />}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {result.option.drive && (
                      <span className="inline-flex items-center gap-1">
                        <Zap aria-hidden className="size-3" />
                        {driveLabel(result.option.drive)}
                      </span>
                    )}
                    <span>{eligible ? "זכאי" : "לא זכאי"}</span>
                  </span>
                  {eligible && result.delta != null ? (
                    <span className="text-sm font-bold">
                      <bdi dir="ltr">{formatDelta(result.delta)}</bdi>
                    </span>
                  ) : (
                    (expanded || fluid) && (
                      <span className="text-xs text-muted-foreground">{result.eligibility.reason}</span>
                    )
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
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
