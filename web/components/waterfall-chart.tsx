"use client";

import { ArrowDown, ArrowUp, ChevronDown, Minus } from "lucide-react";
import { useId, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BarShapeProps } from "recharts";

import { Button } from "@/components/ui/button";
import { WhyPopover } from "@/components/why-popover";
import { findSourceForWaterfallKey } from "@/lib/api/resolve-source-value";
import type { components } from "@/lib/api/schema";
import { formatDelta, formatShekel } from "@/lib/format";
import { cn } from "@/lib/utils";

type OptionResult = components["schemas"]["OptionResult"];
type WaterfallStep = components["schemas"]["WaterfallStep"];
type Source = components["schemas"]["Source"];

export type WaterfallChartProps = {
  /** One OptionResult from Comparison.results — numbers come only from this DTO. */
  result: OptionResult;
  className?: string;
  compact?: boolean;
};

type BarRole = "today" | "step" | "option";

type ChartBar = {
  id: string;
  /** Category tick — Hebrew label from DTO (steps) or chrome ("היום" / "חלופה"). */
  label: string;
  role: BarRole;
  /** [low, high] endpoints from DTO fields only (net_today / net_after / net_option). */
  range: [number, number];
  /** Amount shown on the bar: net for anchors, step.delta for steps. */
  amount: number;
  /** Running net after this bar — DTO net_today / net_after / net_option. */
  netAfter: number;
  direction: "up" | "down" | "flat" | "anchor";
};

const EMPTY_MESSAGE = "אין פירוק מפל להצגה — ההשוואה אינה מלאה או שחסר waterfall מהשרת.";

/**
 * Builds chart rows from DTO fields only.
 * Step bar endpoints: previous running net (net_today or prior net_after) → step.net_after.
 * No client-side money arithmetic for displayed totals.
 */
function buildChartBars(
  netToday: number,
  netOption: number,
  steps: WaterfallStep[],
): ChartBar[] {
  const bars: ChartBar[] = [
    {
      id: "today",
      label: "היום",
      role: "today",
      range: [0, netToday],
      amount: netToday,
      netAfter: netToday,
      direction: "anchor",
    },
  ];

  let previousNet = netToday;
  for (const step of steps) {
    const low = previousNet < step.net_after ? previousNet : step.net_after;
    const high = previousNet < step.net_after ? step.net_after : previousNet;
    const direction: ChartBar["direction"] =
      step.delta > 0 ? "up" : step.delta < 0 ? "down" : "flat";

    bars.push({
      id: step.key,
      label: step.label,
      role: "step",
      range: [low, high],
      amount: step.delta,
      netAfter: step.net_after,
      direction,
    });
    previousNet = step.net_after;
  }

  bars.push({
    id: "option",
    label: "חלופה",
    role: "option",
    range: [0, netOption],
    amount: netOption,
    netAfter: netOption,
    direction: "anchor",
  });

  return bars;
}

function canRenderWaterfall(result: OptionResult): {
  ok: true;
  netToday: number;
  netOption: number;
  delta: number;
  steps: WaterfallStep[];
} | { ok: false } {
  if (!result.complete) return { ok: false };
  if (!result.eligibility.eligible) return { ok: false };
  const steps = result.waterfall;
  if (steps == null || steps.length === 0) return { ok: false };
  if (result.net_today == null || result.net_option == null || result.delta == null) {
    return { ok: false };
  }
  return {
    ok: true,
    netToday: result.net_today,
    netOption: result.net_option,
    delta: result.delta,
    steps,
  };
}

function barFill(bar: ChartBar, hatchId: string): string {
  if (bar.role === "today" || bar.role === "option") {
    return "var(--brand-cobalt)";
  }
  if (bar.direction === "down") {
    return `url(#${hatchId})`;
  }
  if (bar.direction === "up") {
    return "var(--success)";
  }
  return "var(--brand-navy)";
}

function DirectionMark({ direction }: { direction: ChartBar["direction"] }) {
  if (direction === "up") {
    return <ArrowUp aria-hidden className="size-3.5 shrink-0 text-success" />;
  }
  if (direction === "down") {
    return <ArrowDown aria-hidden className="size-3.5 shrink-0 text-error" />;
  }
  if (direction === "flat") {
    return <Minus aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  return null;
}

function amountLabel(bar: ChartBar): string {
  if (bar.role === "step") {
    return formatDelta(bar.amount);
  }
  return formatShekel(bar.amount);
}

function WaterfallBarShape(props: BarShapeProps) {
  const { x, y, width, height, fill } = props;
  if (x == null || y == null || width == null || height == null) {
    return null;
  }
  const w = Math.max(width, 0);
  const h = Math.max(height, 0);
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill={fill}
      stroke="var(--brand-navy)"
      strokeWidth={barStrokeWidth(props)}
    />
  );
}

function barStrokeWidth(props: BarShapeProps): number {
  const payload = props.payload as ChartBar | undefined;
  if (payload?.direction === "down") return 1.5;
  return 0;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartBar }>;
}) {
  if (!active || !payload?.length) return null;
  const bar = payload[0]?.payload;
  if (!bar) return null;
  return (
    <div className="border border-border bg-surface px-3 py-2 text-sm shadow-none">
      <p className="font-semibold">{bar.label}</p>
      <p className="mt-1 tabular-nums">
        <bdi dir="ltr">{amountLabel(bar)}</bdi>
      </p>
      {bar.role === "step" && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          נטו אחרי הצעד:{" "}
          <bdi dir="ltr" className="tabular-nums">
            {formatShekel(bar.netAfter)}
          </bdi>
        </p>
      )}
    </div>
  );
}

/**
 * Waterfall of today → ordered steps → alternative, from OptionResult.waterfall[].
 * Every displayed money value is a DTO field formatted via lib/format.ts.
 */
export function WaterfallChart({ result, className, compact = false }: WaterfallChartProps) {
  const reactId = useId();
  const hatchId = `waterfall-neg-hatch-${reactId.replace(/:/g, "")}`;
  const tableId = `waterfall-table-${reactId.replace(/:/g, "")}`;
  const [showBreakdown, setShowBreakdown] = useState(false);

  const gate = canRenderWaterfall(result);
  if (!gate.ok) {
    return (
      <section
        className={cn("border border-border bg-surface-raised px-4 py-3 text-sm text-muted-foreground", className)}
        aria-label="גרף מפל"
        role="status"
      >
        {EMPTY_MESSAGE}
      </section>
    );
  }

  const { netToday, netOption, delta, steps } = gate;
  const bars = buildChartBars(netToday, netOption, steps);
  const chartAriaLabel = `גרף מפל: מהיום לחלופה ב־${steps.length} צעדים. הפרש נטו ${formatDelta(delta)}.`;

  const minChartWidth = Math.max(280, bars.length * 72);

  const maxAbs = bars.reduce((max, bar) => {
    const span = Math.abs(bar.role === "step" ? bar.amount : bar.netAfter);
    return span > max ? span : max;
  }, 1);

  return (
    <section
      className={cn("min-w-0 max-w-full border border-border bg-surface text-foreground", className)}
      aria-label="גרף מפל"
    >
      <header
        className={cn(
          "flex flex-wrap items-baseline justify-between gap-2 border-b border-border",
          compact ? "px-3 py-2" : "px-4 py-3",
        )}
      >
        <h3 className={cn("font-display", compact ? "text-base" : "text-lg")}>פירוק ההפרש</h3>
        <p
          className={cn(
            "inline-flex min-w-0 flex-wrap items-center gap-1.5 font-semibold tabular-nums",
            delta > 0 && "text-success",
            delta < 0 && "text-error",
          )}
        >
          <DirectionMark
            direction={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}
          />
          <span>הפרש </span>
          <bdi dir="ltr">{formatDelta(delta)}</bdi>
          <WhyForField
            sources={result.sources}
            field="delta"
            fieldValue={delta}
            fieldLabel="הפרש במפל"
          />
        </p>
      </header>

      <div className={cn("min-w-0 sm:hidden", compact ? "px-2 py-2" : "px-3 py-3")}>
        <NarrowWaterfall bars={bars} maxAbs={maxAbs} ariaLabel={chartAriaLabel} />
      </div>

      <div
        className={cn("hidden min-w-0 max-w-full overflow-x-auto sm:block", compact ? "px-2 py-2" : "px-3 py-3")}
        role="img"
        aria-label={chartAriaLabel}
      >
        <div style={{ minWidth: minChartWidth, height: compact ? 220 : 280 }} dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bars}
              margin={{ top: 28, right: 8, left: 4, bottom: 8 }}
              accessibilityLayer={false}
            >
              <defs>
                <pattern
                  id={hatchId}
                  width={6}
                  height={6}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width="6" height="6" fill="var(--error-surface)" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke="var(--error)"
                    strokeWidth={2}
                  />
                </pattern>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval={0}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                height={48}
              />
              <YAxis
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                width={56}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickFormatter={(v: number) => formatShekel(v)}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: "var(--surface-raised)" }}
              />
              <Bar
                dataKey="range"
                isAnimationActive={false}
                maxBarSize={48}
                shape={WaterfallBarShape}
              >
                {bars.map((bar) => (
                  <Cell key={bar.id} fill={barFill(bar, hatchId)} />
                ))}
                <LabelList
                  dataKey="amount"
                  position="top"
                  content={(props) => {
                    const index = typeof props.index === "number" ? props.index : -1;
                    const bar = index >= 0 ? bars[index] : undefined;
                    if (!bar || props.x == null || props.y == null) return null;
                    const x = Number(props.x) + Number(props.width ?? 0) / 2;
                    const y = Number(props.y) - 6;
                    const positive = bar.role === "step" && bar.direction === "up";
                    const negative = bar.role === "step" && bar.direction === "down";
                    return (
                      <text
                        x={x}
                        y={y}
                        textAnchor="middle"
                        fill={
                          positive
                            ? "var(--success)"
                            : negative
                              ? "var(--error)"
                              : "var(--foreground)"
                        }
                        fontSize={11}
                        fontWeight={600}
                      >
                        {bar.role === "step"
                          ? `${bar.direction === "up" ? "↑" : bar.direction === "down" ? "↓" : "·"} ${formatDelta(bar.amount)}`
                          : formatShekel(bar.amount)}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={cn("border-t border-border", compact ? "px-3 py-2" : "px-4 py-3")}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-between sm:w-auto"
          aria-expanded={showBreakdown}
          aria-controls={tableId}
          onClick={() => setShowBreakdown((v) => !v)}
        >
          פירוק לפי סדר
          <ChevronDown
            aria-hidden
            data-icon="inline-end"
            className={cn("transition-transform", showBreakdown && "rotate-180")}
          />
        </Button>

        <div className={cn(!showBreakdown && "sr-only")}>
          <OrderedBreakdownTable
            id={tableId}
            steps={steps}
            netToday={netToday}
            netOption={netOption}
            delta={delta}
            sources={result.sources}
          />
        </div>
      </div>
    </section>
  );
}

/** Fits the same bars in the viewport width. Widths are a visual scale; the amounts stay DTO text. */
function NarrowWaterfall({
  bars,
  maxAbs,
  ariaLabel,
}: {
  bars: ChartBar[];
  maxAbs: number;
  ariaLabel: string;
}) {
  return (
    <ul className="flex flex-col gap-3" aria-label={ariaLabel}>
      {bars.map((bar) => {
        const span = Math.abs(bar.role === "step" ? bar.amount : bar.netAfter);
        const width = Math.max(8, Math.min(100, (span / maxAbs) * 100));
        const positive = bar.role === "step" && bar.direction === "up";
        const negative = bar.role === "step" && bar.direction === "down";
        return (
          <li key={bar.id} className="min-w-0">
            <p className="flex min-w-0 items-baseline justify-between gap-2 text-sm">
              <span className="inline-flex min-w-0 items-center gap-1 font-medium break-words">
                <DirectionMark direction={bar.direction} />
                {bar.label}
              </span>
              <bdi
                dir="ltr"
                className={cn(
                  "shrink-0 font-semibold tabular-nums",
                  positive && "text-success",
                  negative && "text-error",
                )}
              >
                {amountLabel(bar)}
              </bdi>
            </p>
            <div className="mt-1 h-2 bg-surface-raised" aria-hidden>
              <div
                className={cn(
                  "h-full",
                  bar.role !== "step" && "bg-cobalt",
                  positive && "bg-success",
                  negative && "bg-error",
                  bar.role === "step" && !positive && !negative && "bg-navy",
                )}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function OrderedBreakdownTable({
  id,
  steps,
  netToday,
  netOption,
  delta,
  sources,
}: {
  id: string;
  steps: WaterfallStep[];
  netToday: number;
  netOption: number;
  delta: number;
  sources: Source[] | undefined;
}) {
  return (
    <table
      id={id}
      className="stack-table relative mt-3 w-full max-w-full border-collapse text-sm"
      aria-label="פירוק לפי סדר"
    >
      <caption className="mb-2 text-start text-xs font-semibold text-muted-foreground">
        פירוק לפי סדר — אותם צעדים כמו בגרף, בסדר המנוע
      </caption>
      <thead>
        <tr className="border-b border-border text-start text-muted-foreground">
          <th scope="col" className="py-2 pe-2 font-medium">
            שלב
          </th>
          <th scope="col" className="py-2 pe-2 font-medium">
            שינוי
          </th>
          <th scope="col" className="py-2 font-medium">
            כיוון
          </th>
          <th scope="col" className="py-2 ps-2 font-medium">
            נטו אחרי
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-border">
          <th scope="row" className="py-2 pe-2 text-start font-semibold">
            היום
          </th>
          <td data-label="שינוי" className="py-2 pe-2 break-words tabular-nums">
            <span className="inline-flex flex-wrap items-center">
              <bdi dir="ltr">{formatShekel(netToday)}</bdi>
              <WhyForField
                sources={sources}
                field="net_today"
                fieldValue={netToday}
                fieldLabel="נטו היום"
              />
            </span>
          </td>
          <td data-label="כיוון" className="py-2 text-muted-foreground">בסיס</td>
          <td data-label="נטו אחרי" className="py-2 ps-2 tabular-nums">
            <bdi dir="ltr">{formatShekel(netToday)}</bdi>
          </td>
        </tr>
        {steps.map((step) => {
          const direction =
            step.delta > 0 ? "עלייה" : step.delta < 0 ? "ירידה" : "ללא שינוי";
          const stepSource = findSourceForWaterfallKey(sources, step.key);
          return (
            <tr key={step.key} className="border-b border-border">
              <th scope="row" className="py-2 pe-2 text-start font-medium break-words">
                {step.label}
              </th>
              <td
                data-label="שינוי"
                className={cn(
                  "py-2 pe-2 font-semibold break-words tabular-nums",
                  step.delta > 0 && "text-success",
                  step.delta < 0 && "text-error",
                )}
              >
                <span className="inline-flex items-center gap-1">
                  <DirectionMark
                    direction={
                      step.delta > 0 ? "up" : step.delta < 0 ? "down" : "flat"
                    }
                  />
                  <bdi dir="ltr">{formatDelta(step.delta)}</bdi>
                  {stepSource && (
                    <WhyPopover
                      source={stepSource}
                      fieldValue={step.delta}
                      fieldLabel={step.label}
                    />
                  )}
                </span>
              </td>
              <td data-label="כיוון" className="py-2">{direction}</td>
              <td data-label="נטו אחרי" className="py-2 ps-2 tabular-nums">
                <bdi dir="ltr">{formatShekel(step.net_after)}</bdi>
              </td>
            </tr>
          );
        })}
        <tr className="border-b border-border">
          <th scope="row" className="py-2 pe-2 text-start font-semibold">
            חלופה
          </th>
          <td data-label="שינוי" className="py-2 pe-2 break-words tabular-nums">
            <span className="inline-flex flex-wrap items-center">
              <bdi dir="ltr">{formatShekel(netOption)}</bdi>
              <WhyForField
                sources={sources}
                field="net_option"
                fieldValue={netOption}
                fieldLabel="נטו בחלופה"
              />
            </span>
          </td>
          <td data-label="כיוון" className="py-2 text-muted-foreground">סיום</td>
          <td data-label="נטו אחרי" className="py-2 ps-2 tabular-nums">
            <bdi dir="ltr">{formatShekel(netOption)}</bdi>
          </td>
        </tr>
        <tr>
          <th scope="row" className="py-2 pe-2 text-start font-semibold">
            הפרש
          </th>
          <td
            colSpan={3}
            className={cn(
              "py-2 pe-2 font-semibold break-words tabular-nums",
              delta > 0 && "text-success",
              delta < 0 && "text-error",
            )}
          >
            <span className="inline-flex items-center gap-1">
              <DirectionMark
                direction={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}
              />
              <bdi dir="ltr">{formatDelta(delta)}</bdi>
              <span className="font-medium text-foreground">
                {delta > 0 ? "יותר" : delta < 0 ? "פחות" : "בלי שינוי"}
              </span>
              <WhyForField
                sources={sources}
                field="delta"
                fieldValue={delta}
                fieldLabel="הפרש"
              />
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function WhyForField({
  sources,
  field,
  fieldValue,
  fieldLabel,
}: {
  sources: Source[] | undefined;
  field: string;
  fieldValue?: number | null;
  fieldLabel: string;
}) {
  const source =
    findSourceForWaterfallKey(sources, field) ??
    sources?.find((s) => s.field === field);
  if (!source) return null;
  return (
    <WhyPopover
      source={source}
      fieldValue={fieldValue}
      fieldLabel={fieldLabel}
    />
  );
}
