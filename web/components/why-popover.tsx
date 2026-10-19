"use client";

import { Popover } from "@base-ui/react/popover";
import { useId } from "react";

import {
  resolveSourceValue,
  type SourceLookup,
} from "@/lib/api/resolve-source-value";
import { useCatalog, useConfig, useOccupations } from "@/lib/api/use-config";
import type { components } from "@/lib/api/schema";
import { formatShekel } from "@/lib/format";
import { cn } from "@/lib/utils";

type Source = components["schemas"]["Source"];

export type WhyPopoverProps = {
  source: Source;
  /**
   * The DTO number this source explains (e.g. OptionResult.value_of_use).
   * Shown for VALUE_OF_USE_DB and when a CONFIG value cannot be resolved from /v1/config.
   */
  fieldValue?: number | null;
  className?: string;
  /** Extra label context for aria-label, e.g. the row name. */
  fieldLabel?: string;
};

function kindLabel(kind: Source["kind"]): string {
  switch (kind) {
    case "CONFIG":
      return "קונפיג";
    case "VALUE_OF_USE_DB":
      return "מאגר שווי שימוש";
  }
}

const heNumber = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 4 });

function formatResolvedValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (typeof value === "number") return heNumber.format(value);
  return value;
}

/**
 * Small "למה?" trigger next to a DTO number. Opens a popover with the engine Source
 * and the matching value from GET /v1/config (or catalog/occupations when the ref points there).
 * Render only when a Source exists for that field — never invent sources.
 */
export function WhyPopover({
  source,
  fieldValue = null,
  className,
  fieldLabel,
}: WhyPopoverProps) {
  const titleId = useId();
  const configQuery = useConfig();
  const catalogQuery = useCatalog();
  const occupationsQuery = useOccupations();

  const lookup: SourceLookup = {
    config: configQuery.data,
    catalog: catalogQuery.data,
    occupations: occupationsQuery.data,
  };

  const resolved = resolveSourceValue(source, lookup);
  const aria = fieldLabel
    ? `למה? מקור ל${fieldLabel}`
    : `למה? מקור ל${source.label}`;

  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        aria-label={aria}
        className={cn(
          "ms-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border sm:min-h-8 sm:min-w-8",
          "px-1.5 text-xs font-semibold text-link hover:bg-muted",
          "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        למה?
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
          <Popover.Popup
            aria-labelledby={titleId}
            className="rounded-xl shadow-card w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] border border-border bg-surface px-3 py-3 text-sm text-foreground outline-none"
          >
            <Popover.Title
              id={titleId}
              className="font-display text-base font-normal"
            >
              {source.label}
            </Popover.Title>
            <div className="mt-2 space-y-1.5 text-sm text-foreground">
              <Popover.Description>
                <span className="text-muted-foreground">סוג מקור: </span>
                {kindLabel(source.kind)}
              </Popover.Description>
              <p>
                <span className="text-muted-foreground">מפתח: </span>
                <bdi dir="ltr" className="break-all font-mono text-xs">
                  {source.ref}
                </bdi>
              </p>
              <ConfigValueRow
                source={source}
                resolved={resolved}
                fieldValue={fieldValue}
                loading={
                  configQuery.isPending ||
                  catalogQuery.isPending ||
                  occupationsQuery.isPending
                }
              />
            </div>
            <Popover.Close
              type="button"
              className="rounded-full mt-3 inline-flex min-h-11 items-center border border-border px-3 text-xs font-semibold hover:bg-muted sm:min-h-9"
            >
              סגור
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ConfigValueRow({
  source,
  resolved,
  fieldValue,
  loading,
}: {
  source: Source;
  resolved: string | number | boolean | null;
  fieldValue: number | null;
  loading: boolean;
}) {
  if (loading && resolved == null && source.kind === "CONFIG") {
    return (
      <p className="text-muted-foreground" aria-busy="true">
        טוען ערך מהקונפיג…
      </p>
    );
  }

  if (resolved != null) {
    return (
      <p>
        <span className="text-muted-foreground">ערך בקונפיג: </span>
        <bdi dir="ltr" className="tabular-nums font-semibold">
          {formatResolvedValue(resolved)}
        </bdi>
      </p>
    );
  }

  if (source.kind === "VALUE_OF_USE_DB" && fieldValue != null) {
    return (
      <p>
        <span className="text-muted-foreground">ערך מהמאגר (בתוצאה): </span>
        <bdi dir="ltr" className="tabular-nums font-semibold">
          {formatShekel(fieldValue)}
        </bdi>
      </p>
    );
  }

  if (fieldValue != null) {
    return (
      <p>
        <span className="text-muted-foreground">ערך בתוצאה: </span>
        <bdi dir="ltr" className="tabular-nums font-semibold">
          {formatShekel(fieldValue)}
        </bdi>
      </p>
    );
  }

  return null;
}
