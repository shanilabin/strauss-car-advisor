"use client";

import { FileUp, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { useId, useRef, useState } from "react";

import type { components } from "@/lib/api/schema";
import { PayslipError, type PayslipParse, useParsePayslip } from "@/lib/api/use-parse-payslip";
import { cn } from "@/lib/utils";

type Salary = components["schemas"]["SalaryInput-Input"];
type Deductions = components["schemas"]["Deductions-Input"];

/** What the employee confirmed: saved to the profile, then told to the advisor (who finds the car). */
export type PayslipApply = {
  salary: Salary | null;
  deductions: Deductions | null;
  /** The employee's words to the advisor - e.g. the car and its value of use, to find the exact variant. */
  message: string;
};

type Key =
  | "base_salary"
  | "commissions"
  | "bonus"
  | "pension_pct"
  | "study_fund_pct"
  | "credit_points"
  | "value_of_use"
  | "car_participation"
  | "car_text";

const FIELDS: { key: Key; label: string; max?: number; text?: boolean }[] = [
  { key: "base_salary", label: "שכר בסיס (₪)" },
  { key: "commissions", label: "עמלות (₪)" },
  { key: "bonus", label: "בונוס (₪)" },
  { key: "pension_pct", label: "פנסיה עובד (%)", max: 100 },
  { key: "study_fund_pct", label: "קרן השתלמות עובד (%)", max: 100 },
  { key: "credit_points", label: "נקודות זיכוי", max: 30 },
  { key: "car_text", label: "הרכב", text: true },
  { key: "value_of_use", label: "שווי שימוש רכב (₪)" },
  { key: "car_participation", label: "השתתפות ברכב (₪)" },
];

type Draft = Record<Key, string>;

function draftFrom(parse: PayslipParse): Draft {
  const r = parse.reading;
  const text = (v: number | string | null | undefined) => (v == null ? "" : String(v));
  return {
    base_salary: text(r.base_salary),
    commissions: text(r.commissions),
    bonus: text(r.bonus),
    pension_pct: text(r.pension_pct),
    study_fund_pct: text(r.study_fund_pct),
    credit_points: text(r.credit_points),
    value_of_use: text(r.value_of_use),
    car_participation: text(r.car_participation),
    car_text: text(r.car_text),
  };
}

/** A number the employee confirmed, null when left empty, or a Hebrew reason it can't be used. */
function numberOf(raw: string, label: string, max?: number): number | null | string {
  const trimmed = raw.trim().replaceAll(",", "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return `${label}: נא להזין מספר`;
  if (max != null && n > max) return `${label}: עד ${max}`;
  return n;
}

/**
 * "Upload a payslip and we'll fill in the details": the file is read on the server (never stored), the
 * values come back AS PRINTED, and the employee checks and corrects them here before anything is saved.
 * Then the advisor is told the car and its value of use, so it finds the exact variant.
 */
export function PayslipUpload({
  disabled = false,
  applying = false,
  applyError = null,
  onApply,
}: {
  disabled?: boolean;
  applying?: boolean;
  applyError?: string | null;
  onApply: (apply: PayslipApply) => void;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const parse = useParsePayslip();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    parse.mutate(file, {
      onSuccess: (result) => {
        // nothing a payslip prints was found: an invitation, a photo of something else...
        if (Object.values(result.reading).every((value) => value == null)) {
          setError("לא מצאנו בקובץ נתונים של תלוש שכר. בדקו שזה התלוש, או כתבו את הפרטים בצ'אט.");
          parse.reset();
          return;
        }
        setDraft(draftFrom(result));
      },
      onError: (e) => setError(e instanceof PayslipError ? e.message : "קריאת התלוש נכשלה. נסו שוב."),
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function confirm() {
    if (!draft) return;
    const values: Partial<Record<Key, number | null>> = {};
    for (const field of FIELDS) {
      if (field.text) continue;
      const n = numberOf(draft[field.key], field.label, field.max);
      if (typeof n === "string") {
        setError(n);
        return;
      }
      values[field.key] = n;
    }
    setError(null);
    const base = values.base_salary ?? null;
    // A line that is not on the payslip (no commissions, no bonus, no study fund) is 0 - and the
    // employee sees that before confirming. Pension and credit points are never assumed: without both,
    // the advisor asks.
    const salary: Salary | null =
      base != null && base > 0
        ? { base, commissions: values.commissions ?? 0, bonus: values.bonus ?? 0 }
        : null;
    const deductions: Deductions | null =
      values.pension_pct != null && values.credit_points != null
        ? {
            pension_pct: values.pension_pct,
            study_fund_pct: values.study_fund_pct ?? 0,
            credit_points: values.credit_points,
          }
        : null;
    const car = draft.car_text.trim();
    const parts = [
      car ? `הרכב שלי לפי התלוש: ${car}` : null,
      values.value_of_use != null ? `שווי שימוש בתלוש: ${values.value_of_use} ₪` : null,
      values.car_participation != null ? `השתתפות ברכב: ${values.car_participation} ₪ בחודש` : null,
    ].filter(Boolean);
    const message =
      parts.length > 0
        ? `העליתי את תלוש השכר שלי. ${parts.join(". ")}.`
        : "העליתי את תלוש השכר שלי ומילאתי ממנו את השכר והניכויים.";
    onApply({ salary, deductions, message });
  }

  const reviewing = draft != null && parse.data != null;
  const notConfirmed = new Set(parse.data?.not_confirmed ?? []);
  const fromImage = parse.data?.read_from === "image";
  const shownError = error ?? applyError;

  if (reviewing && draft) {
    return (
      <section
        aria-label="בדיקת הנתונים מהתלוש"
        className="mx-3 mb-2 flex max-h-[55vh] flex-col gap-3 overflow-y-auto rounded-2xl border border-primary/30 bg-surface p-3 shadow-soft"
      >
        <div>
          <p className="font-bold">מה מצאנו בתלוש{parse.data?.reading.month ? ` (${parse.data.reading.month})` : ""}</p>
          <p className="text-xs text-muted-foreground">
            {fromImage
              ? "נקרא מתמונה: בדקו כל ערך מול התלוש ותקנו לפני השמירה."
              : "נקרא מהטקסט של התלוש, וכל מספר נבדק מול התלוש. בדקו ותקנו אם צריך."}{" "}
            שדה ריק בעמלות, בונוס או קרן השתלמות נשמר כ-0, כי הוא לא מופיע בתלוש.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FIELDS.map((field) => {
            const id = `${inputId}-${field.key}`;
            const unverified = notConfirmed.has(field.key);
            return (
              <label key={field.key} htmlFor={id} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {field.label}
                <input
                  id={id}
                  value={draft[field.key]}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                  inputMode={field.text ? undefined : "decimal"}
                  dir={field.text ? undefined : "ltr"}
                  placeholder="לא מופיע בתלוש"
                  aria-describedby={unverified ? `${id}-hint` : undefined}
                  className={cn(
                    "min-h-10 rounded-xl border bg-background px-3 text-base text-foreground focus-visible:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    field.text ? "text-start" : "text-end",
                    unverified ? "border-pending" : "border-input",
                  )}
                />
                {unverified && (
                  <span id={`${id}-hint`} className="font-semibold text-pending">
                    לא אומת מול התלוש. הזינו את הערך מהתלוש.
                  </span>
                )}
              </label>
            );
          })}
        </div>
        {shownError && (
          <p role="alert" className="text-sm font-semibold text-error">
            {shownError}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={applying}
            className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-(--primary-hover) disabled:opacity-45"
          >
            {applying ? "שומר…" : "אישור ושמירה"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setError(null);
              parse.reset();
            }}
            disabled={applying}
            className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted"
          >
            ביטול
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="mx-3 mb-2 flex flex-col gap-1.5 rounded-2xl border border-dashed border-primary/40 bg-mist/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <FileUp aria-hidden className="size-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm font-semibold">יש לך תלוש שכר? העלו אותו ונמלא את הפרטים בשבילכם.</p>
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={disabled || parse.isPending}
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-(--primary-hover)",
            (disabled || parse.isPending) && "pointer-events-none opacity-60",
          )}
        >
          {parse.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {parse.isPending ? "קורא את התלוש…" : "העלאת תלוש"}
        </label>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <ShieldCheck aria-hidden className="size-3.5 shrink-0" />
        התלוש לא נשמר, ות״ז לא נקראת.
      </p>
      {shownError && (
        <p role="alert" className="flex items-center gap-1 text-sm font-semibold text-error">
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          {shownError}
        </p>
      )}
    </div>
  );
}
