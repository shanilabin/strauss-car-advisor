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

/** What each sourced number means, in an employee's words. Unknown fields fall back to the label. */
const EXPLANATIONS: Record<string, string> = {
  group_budget: "זה התקציב החודשי שהחברה מקצה לרכב בקבוצה שלך, לפי כללי רכב החברה.",
  cost_to_company: "כמה הרכב הזה עולה לחברה בכל חודש, לפי קטלוג הרכבים של החברה.",
  participation:
    "הסכום שהעובד משלם בכל חודש על הרכב. עד שנציג התחבורה מאשר, מוצגת ברירת המחדל מהקטלוג.",
  value_of_use:
    "שווי השימוש נלקח מהמאגר הרשמי של רשות המסים, לפי הדגם המדויק של הרכב. הוא נוסף לשכר שעליו משלמים מס.",
  maintenance: "אחזקת הרכב שמקבלים כשמוותרים על רכב החברה, לפי טבלת העיסוקים של החברה.",
  electric_refund_net:
    "החזר החשמל החודשי שהחברה נותנת על רכב חשמלי. הוא מגולם, כלומר מגיע במלואו לנטו.",
  track_employee_share:
    "במסלול ברוכת ילדים העובד משלם חלק מהפער שבין עלות הרכב לתקציב הקבוצה, והחברה את השאר.",
  eligibility: "הזכאות נקבעת לפי כללי רכב החברה: הקבוצה שלך, העיסוק שלך והמסלולים.",
};

function explanationFor(source: Source): string {
  return EXPLANATIONS[source.field] ?? source.label;
}

function sourceName(kind: Source["kind"]): string {
  switch (kind) {
    case "CONFIG":
      return "כללי רכב החברה (קובץ הכללים)";
    case "VALUE_OF_USE_DB":
      return "מאגר שווי השימוש של רשות המסים";
  }
}

/** Shares (0.5) read as percent; amounts as shekels; anything else as it is. */
function formatResolvedValue(source: Source, value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (typeof value === "number") {
    if (source.field === "track_employee_share" && value <= 1) return heNumber.format(value * 100) + "%";
    return MONEY_FIELDS.has(source.field) ? formatShekel(value) : heNumber.format(value);
  }
  return value;
}

const MONEY_FIELDS = new Set([
  "group_budget",
  "cost_to_company",
  "participation",
  "value_of_use",
  "maintenance",
  "electric_refund_net",
]);

const heNumber = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 4 });

/**
 * Small "למה?" trigger next to a DTO number. Opens a popover that says, in plain Hebrew, what the
 * number is and where it comes from, with its value (from GET /v1/config, catalog or occupations).
 * The exact technical source stays one click away for anyone who wants to check it.
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
            className="w-[min(21rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface px-4 py-4 text-sm text-foreground shadow-card outline-none"
          >
            <Popover.Title id={titleId} className="text-base font-extrabold">
              {source.label}
            </Popover.Title>
            <Popover.Description className="mt-1.5 leading-relaxed text-foreground/85">
              {explanationFor(source)}
            </Popover.Description>
            <ValueRow
              source={source}
              resolved={resolved}
              fieldValue={fieldValue}
              loading={configQuery.isPending || catalogQuery.isPending || occupationsQuery.isPending}
            />
            <details className="group mt-3 text-xs text-muted-foreground">
              <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 font-semibold [&::-webkit-details-marker]:hidden">
                המקור המדויק
                <span aria-hidden className="transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <p className="mt-1">{sourceName(source.kind)}</p>
              <p className="mt-0.5">
                <bdi dir="ltr" className="font-mono break-all">
                  {source.ref}
                </bdi>
              </p>
            </details>
            <Popover.Close
              type="button"
              className="mt-3 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-xs font-semibold hover:bg-muted sm:min-h-9"
            >
              סגירה
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ValueRow({
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
      <p className="mt-3 text-muted-foreground" aria-busy="true">
        טוען…
      </p>
    );
  }
  const value =
    resolved != null
      ? formatResolvedValue(source, resolved)
      : fieldValue != null
        ? formatShekel(Math.abs(fieldValue)) // waterfall rows carry a sign; the explanation does not
        : null;
  if (value == null) return null;
  return (
    <p className="mt-3 inline-flex items-baseline gap-2 rounded-xl bg-mist px-3 py-1.5">
      <span className="text-muted-foreground">הערך:</span>
      <bdi dir="ltr" className="text-base font-extrabold tabular-nums">
        {value}
      </bdi>
    </p>
  );
}
