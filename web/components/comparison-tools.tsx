"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FileDown, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { PrintSummary } from "@/components/print-summary";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDelta, formatShekel } from "@/lib/format";
import { cn } from "@/lib/utils";

type Comparison = components["schemas"]["Comparison"];
type OptionResult = components["schemas"]["OptionResult"];
type ProfileInput = components["schemas"]["Profile-Input"];

const SALARY_STEP = 250;
const DEBOUNCE_MS = 350;

/**
 * Under the comparison: "what if my salary changes?" and a one-page summary to save as PDF. Both read the
 * engine's DTOs only - the what-if asks the stateless /v1/compare and stores nothing.
 */
export function ComparisonTools({ comparison, optionId }: { comparison: Comparison; optionId: string | null }) {
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const result =
    comparison.results.find((r) => r.option.id === optionId) ??
    comparison.results.find((r) => r.option.id === comparison.best_option_id) ??
    comparison.results[0] ??
    null;
  if (!result) return null;
  const salary = comparison.profile_snapshot.salary;
  const canWhatIf = result.eligibility.eligible && result.delta != null && salary != null;

  return (
    <div className="flex shrink-0 flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canWhatIf && (
          <Button
            type="button"
            variant={whatIfOpen ? "secondary" : "outline"}
            size="sm"
            onClick={() => setWhatIfOpen((open) => !open)}
            aria-expanded={whatIfOpen}
          >
            <SlidersHorizontal aria-hidden data-icon="inline-start" />
            מה אם השכר ישתנה?
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
          <FileDown aria-hidden data-icon="inline-start" />
          הורדת סיכום PDF
        </Button>
      </div>
      {whatIfOpen && canWhatIf && (
        <WhatIfPanel comparison={comparison} result={result} onClose={() => setWhatIfOpen(false)} />
      )}
      {/* straight under <body>: printing hides everything else, and no scrolling box can clip it */}
      {mounted && createPortal(<PrintSummary comparison={comparison} result={result} />, document.body)}
    </div>
  );
}

const noop = () => () => {};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function WhatIfPanel({
  comparison,
  result,
  onClose,
}: {
  comparison: Comparison;
  result: OptionResult;
  onClose: () => void;
}) {
  const profile = comparison.profile_snapshot;
  const salary = profile.salary!;
  const [base, setBase] = useState(salary.base);
  const [bonus, setBonus] = useState(salary.bonus ?? 0);
  const asked = useDebounced({ base, bonus }, DEBOUNCE_MS);
  const changed = asked.base !== salary.base || asked.bonus !== (salary.bonus ?? 0);
  const baseId = useId();
  const bonusId = useId();

  const whatIf = useQuery({
    queryKey: ["what-if", comparison.id, result.option.id, asked.base, asked.bonus] as const,
    enabled: changed,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<OptionResult | null> => {
      // the same profile with another salary - never saved; the engine answers for this one option
      const body = {
        profile: { ...profile, salary: { ...salary, base: asked.base, bonus: asked.bonus } } as ProfileInput,
        option_ids: [result.option.id],
      };
      const { data, error } = await api.POST("/v1/compare", { body });
      if (error || !data) throw new Error("לא הצלחנו לחשב את התרחיש. נסו שוב.");
      return data.results[0] ?? null;
    },
  });

  const shown = changed ? (whatIf.data ?? null) : result;
  const min = Math.max(SALARY_STEP, Math.round((salary.base * 0.5) / SALARY_STEP) * SALARY_STEP);
  const max = Math.round((salary.base * 2) / SALARY_STEP) * SALARY_STEP;

  return (
    <section
      aria-label="מה אם השכר ישתנה"
      className="rounded-3xl border border-border/70 bg-surface p-4 shadow-soft sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold">מה אם השכר ישתנה?</h3>
          <p className="text-sm text-muted-foreground">
            רק בדיקה: הפרטים שלך לא משתנים. כל מספר מחושב במנוע, ל<bdi>{result.option.label}</bdi> מול היום.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="סגירה">
          <X aria-hidden />
        </Button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Slider
          id={baseId}
          label="שכר בסיס חודשי"
          value={base}
          min={min}
          max={max}
          onChange={setBase}
        />
        <Slider id={bonusId} label="בונוס חודשי" value={bonus} min={0} max={Math.max(10000, bonus)} onChange={setBonus} />
      </div>

      <div aria-live="polite" className={cn("mt-4", whatIf.isFetching && "opacity-60")}>
        {whatIf.isError ? (
          <p role="alert" className="text-sm font-semibold text-error">
            {whatIf.error.message}
          </p>
        ) : shown && shown.delta != null ? (
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Outcome label="נטו היום" value={formatShekel(shown.net_today ?? 0)} />
            <Outcome label="נטו בחלופה" value={formatShekel(shown.net_option ?? 0)} />
            <Outcome
              label="הפרש חודשי"
              value={formatDelta(shown.delta)}
              tone={shown.delta > 0 ? "text-success" : shown.delta < 0 ? "text-error" : undefined}
            />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">מחשבים…</p>
        )}
        {changed && shown?.delta != null && result.delta != null && (
          <p className="mt-2 text-center text-sm text-muted-foreground">
            לעומת ההשוואה שעל המסך:{" "}
            <bdi dir="ltr" className="font-bold text-foreground">
              {formatDelta(shown.delta - result.delta)}
            </bdi>{" "}
            בהפרש החודשי
          </p>
        )}
      </div>
    </section>
  );
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-semibold">
        {label}
        <bdi dir="ltr" className="tabular-nums text-primary">
          {formatShekel(value)}
        </bdi>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={SALARY_STEP}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-(--primary)"
      />
    </div>
  );
}

function Outcome({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-mist/60 px-2 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 text-lg font-extrabold tabular-nums", tone)}>
        <bdi dir="ltr">{value}</bdi>
      </dd>
    </div>
  );
}
