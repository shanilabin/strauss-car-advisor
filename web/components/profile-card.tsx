"use client";

import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import {
  PatchProfileError,
  usePatchProfile,
  type ProfilePatch,
} from "@/lib/api/use-patch-profile";
import { formatPercent, formatShekel } from "@/lib/format";
import { cn } from "@/lib/utils";

type Profile = components["schemas"]["Profile-Output"];
type MissingField = components["schemas"]["MissingField"];
type Occupation = components["schemas"]["Occupation"];
type Salary = NonNullable<Profile["salary"]>;
type Deductions = NonNullable<Profile["deductions"]>;
type CarArrangement = components["schemas"]["CarArrangement"];
type WaiverArrangement = components["schemas"]["WaiverArrangement"];

type ProfileCardProps = {
  conversationId: string;
  profile: Profile;
  missing?: MissingField[];
  className?: string;
};

type FieldKey =
  | "occupation"
  | "group"
  | "salary.base"
  | "salary.commissions"
  | "salary.bonus"
  | "deductions.pension_pct"
  | "deductions.study_fund_pct"
  | "deductions.credit_points"
  | "children_under_23"
  | "current"
  | "current.participation"
  | "current.maintenance";

type EditableKey = Exclude<FieldKey, "group" | "current">;

function missingKeys(missing: MissingField[]): Set<string> {
  return new Set(missing.map((m) => m.field));
}

function isFieldMissing(keys: Set<string>, field: FieldKey, hasValue: boolean): boolean {
  if (!hasValue) return true;
  if (keys.has(field)) return true;
  if (field.startsWith("salary.") && keys.has("salary.base") && field === "salary.base") return true;
  if (field.startsWith("deductions.") && keys.has("deductions")) return true;
  if (field === "current" && keys.has("current")) return true;
  if (field === "current.participation" && keys.has("current.participation")) return true;
  return false;
}

function formatGroupLabel(group: string): string {
  const letter = group.endsWith("׳") ? group : `${group}׳`;
  return `קבוצה ${letter} · לפי העיסוק שמסרת`;
}

function currentVehicleLabel(current: CarArrangement | WaiverArrangement): string {
  if (current.kind === "waiver") {
    return "ויתור על רכב (אחזקה)";
  }
  const name = [current.vehicle.maker_name, current.vehicle.commercial_name]
    .filter(Boolean)
    .join(" ");
  return name || current.vehicle.model_desc;
}

function MoneyValue({ amount }: { amount: number }) {
  return (
    <bdi dir="ltr" className="tabular-nums">
      {formatShekel(amount)}
    </bdi>
  );
}

function PercentValue({ value }: { value: number }) {
  return (
    <bdi dir="ltr" className="tabular-nums">
      {formatPercent(value)}
    </bdi>
  );
}

export function ProfileCard({
  conversationId,
  profile,
  missing = [],
  className,
}: ProfileCardProps) {
  const patchProfile = usePatchProfile(conversationId);
  const [editing, setEditing] = useState<EditableKey | null>(null);
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const occupations = useQuery({
    queryKey: ["occupations"] as const,
    queryFn: async (): Promise<Occupation[]> => {
      const { data, error } = await api.GET("/v1/occupations");
      if (error || !data) {
        throw new Error("לא ניתן לטעון את רשימת העיסוקים");
      }
      return data;
    },
  });

  const keys = missingKeys(missing);
  const salary = profile.salary ?? null;
  const deductions = profile.deductions ?? null;
  const current = profile.current ?? null;

  const saving = patchProfile.isPending;
  const errorMessage =
    localError ??
    (patchProfile.error instanceof PatchProfileError
      ? patchProfile.error.message
      : patchProfile.error
        ? "שמירת הפרופיל נכשלה. נסו שוב."
        : null);

  function startEdit(field: EditableKey, initial: string) {
    if (saving) return;
    setLocalError(null);
    patchProfile.reset();
    setEditing(field);
    setDraft(initial);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft("");
    setLocalError(null);
  }

  function buildPatch(field: EditableKey, raw: string): ProfilePatch | null {
    const expected_revision = profile.revision;
    const trimmed = raw.trim();

    if (field === "occupation") {
      if (!trimmed) {
        setLocalError("נא לבחור עיסוק.");
        return null;
      }
      return { expected_revision, occupation: trimmed };
    }

    if (field === "children_under_23") {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        setLocalError("נא להזין מספר שלם תקין.");
        return null;
      }
      return { expected_revision, children_under_23: n };
    }

    if (field.startsWith("salary.")) {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        setLocalError("נא להזין סכום תקין.");
        return null;
      }
      if (salary == null && field !== "salary.base") {
        setLocalError("נא למלא קודם את שכר הבסיס.");
        return null;
      }
      const next: Salary = {
        base: salary?.base ?? 0,
        commissions: salary?.commissions ?? 0,
        bonus: salary?.bonus ?? 0,
      };
      if (field === "salary.base") next.base = n;
      if (field === "salary.commissions") next.commissions = n;
      if (field === "salary.bonus") next.bonus = n;
      return { expected_revision, salary: next };
    }

    if (field.startsWith("deductions.")) {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        setLocalError("נא להזין ערך תקין.");
        return null;
      }
      const next: Deductions = {
        pension_pct: deductions?.pension_pct ?? 0,
        study_fund_pct: deductions?.study_fund_pct ?? 0,
        credit_points: deductions?.credit_points ?? 0,
      };
      if (field === "deductions.pension_pct") next.pension_pct = n;
      if (field === "deductions.study_fund_pct") next.study_fund_pct = n;
      if (field === "deductions.credit_points") next.credit_points = n;
      // Partial first fill: siblings default to 0 until the employee edits them.
      return { expected_revision, deductions: next };
    }

    if (field === "current.participation") {
      if (!current || current.kind !== "car") {
        setLocalError("אין רכב נוכחי לעדכון השתתפות.");
        return null;
      }
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        setLocalError("נא להזין סכום תקין.");
        return null;
      }
      const next: CarArrangement = {
        ...current,
        participation: n,
      };
      return { expected_revision, current: next };
    }

    if (field === "current.maintenance") {
      if (!current || current.kind !== "waiver") {
        setLocalError("אין הסדר אחזקה לעדכון.");
        return null;
      }
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        setLocalError("נא להזין סכום תקין.");
        return null;
      }
      const next: WaiverArrangement = {
        kind: "waiver",
        maintenance: n,
      };
      return { expected_revision, current: next };
    }

    return null;
  }

  function saveEdit() {
    if (!editing || saving) return;
    setLocalError(null);
    const patch = buildPatch(editing, draft);
    if (!patch) return;
    patchProfile.mutate(patch, {
      onSuccess: () => {
        cancelEdit();
      },
    });
  }

  const occupationMissing = isFieldMissing(keys, "occupation", Boolean(profile.occupation));
  const groupMissing = isFieldMissing(keys, "group", Boolean(profile.group));
  const baseMissing = isFieldMissing(keys, "salary.base", salary != null);
  const commissionsMissing = salary == null;
  const bonusMissing = salary == null;
  const pensionMissing = isFieldMissing(keys, "deductions.pension_pct", deductions != null);
  const studyMissing = isFieldMissing(keys, "deductions.study_fund_pct", deductions != null);
  const creditMissing = isFieldMissing(keys, "deductions.credit_points", deductions != null);
  const childrenMissing = isFieldMissing(
    keys,
    "children_under_23",
    profile.children_under_23 != null,
  );
  const currentMissing = isFieldMissing(keys, "current", current != null);
  const participationMissing =
    current?.kind === "car"
      ? isFieldMissing(keys, "current.participation", current.participation != null)
      : false;

  const confirmed = profile.confirmed_participation
    ? Object.entries(profile.confirmed_participation)
    : [];

  return (
    <section
      aria-label="פרופיל עובד"
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-x-clip overflow-y-auto border border-border bg-surface",
        className,
      )}
    >
      <header className="shrink-0 border-b border-border px-5 py-4">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          EMPLOYEE PROFILE
        </p>
        <h2 className="mt-1 font-display text-2xl">הנתונים שלך</h2>
      </header>

      <div className="flex flex-col gap-0 px-5 py-2">
        <ProfileRow
          label="עיסוק"
          missing={occupationMissing}
          editing={editing === "occupation"}
          saving={saving}
          onStartEdit={() => startEdit("occupation", profile.occupation ?? "")}
          display={profile.occupation}
        >
          {editing === "occupation" ? (
            <FieldEditor
              kind="select"
              label="עיסוק"
              value={draft}
              disabled={saving}
              options={(occupations.data ?? []).map((o) => ({
                value: o.name,
                label: o.name,
              }))}
              loading={occupations.isPending}
              onChange={setDraft}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />
          ) : null}
        </ProfileRow>

        <ProfileRow
          label="קבוצת רכב"
          missing={groupMissing}
          readOnly
          display={profile.group ? formatGroupLabel(profile.group) : null}
        />

        <ProfileRow
          label="שכר בסיס"
          missing={baseMissing}
          editing={editing === "salary.base"}
          saving={saving}
          onStartEdit={() =>
            startEdit("salary.base", salary != null ? String(salary.base) : "")
          }
          display={salary != null ? <MoneyValue amount={salary.base} /> : null}
        >
          {editing === "salary.base" ? (
            <NumberEditor
              label="שכר בסיס"
              value={draft}
              disabled={saving}
              onChange={setDraft}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />
          ) : null}
        </ProfileRow>

        <ProfileRow
          label="עמלות"
          missing={commissionsMissing}
          editing={editing === "salary.commissions"}
          saving={saving}
          onStartEdit={() =>
            startEdit(
              "salary.commissions",
              salary != null ? String(salary.commissions) : "",
            )
          }
          display={salary != null ? <MoneyValue amount={salary.commissions} /> : null}
        >
          {editing === "salary.commissions" ? (
            <NumberEditor
              label="עמלות"
              value={draft}
              disabled={saving}
              onChange={setDraft}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />
          ) : null}
        </ProfileRow>

        <ProfileRow
          label="בונוס"
          missing={bonusMissing}
          editing={editing === "salary.bonus"}
          saving={saving}
          onStartEdit={() =>
            startEdit("salary.bonus", salary != null ? String(salary.bonus) : "")
          }
          display={salary != null ? <MoneyValue amount={salary.bonus} /> : null}
        >
          {editing === "salary.bonus" ? (
            <NumberEditor
              label="בונוס"
              value={draft}
              disabled={saving}
              onChange={setDraft}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />
          ) : null}
        </ProfileRow>

        <ProfileRow
          label="פנסיה"
          missing={pensionMissing}
          editing={editing === "deductions.pension_pct"}
          saving={saving}
          onStartEdit={() =>
            startEdit(
              "deductions.pension_pct",
              deductions != null ? String(deductions.pension_pct) : "",
            )
          }
          display={
            deductions != null ? <PercentValue value={deductions.pension_pct} /> : null
          }
        >
          {editing === "deductions.pension_pct" ? (
            <NumberEditor
              label="פנסיה (%)"
              value={draft}
              disabled={saving}
              step="0.01"
              onChange={setDraft}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />
          ) : null}
        </ProfileRow>

        <ProfileRow
          label="קרן השתלמות"
          missing={studyMissing}
          editing={editing === "deductions.study_fund_pct"}
          saving={saving}
          onStartEdit={() =>
            startEdit(
              "deductions.study_fund_pct",
              deductions != null ? String(deductions.study_fund_pct) : "",
            )
          }
          display={
            deductions != null ? (
              <PercentValue value={deductions.study_fund_pct} />
            ) : null
          }
        >
          {editing === "deductions.study_fund_pct" ? (
            <NumberEditor
              label="קרן השתלמות (%)"
              value={draft}
              disabled={saving}
              step="0.01"
              onChange={setDraft}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />
          ) : null}
        </ProfileRow>

        <ProfileRow
          label="נקודות זיכוי"
          missing={creditMissing}
          editing={editing === "deductions.credit_points"}
          saving={saving}
          onStartEdit={() =>
            startEdit(
              "deductions.credit_points",
              deductions != null ? String(deductions.credit_points) : "",
            )
          }
          display={
            deductions != null ? (
              <bdi dir="ltr" className="tabular-nums">
                {deductions.credit_points}
              </bdi>
            ) : null
          }
        >
          {editing === "deductions.credit_points" ? (
            <NumberEditor
              label="נקודות זיכוי"
              value={draft}
              disabled={saving}
              step="0.01"
              onChange={setDraft}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />
          ) : null}
        </ProfileRow>

        <ProfileRow
          label="מספר ילדים"
          missing={childrenMissing}
          editing={editing === "children_under_23"}
          saving={saving}
          onStartEdit={() =>
            startEdit(
              "children_under_23",
              profile.children_under_23 != null
                ? String(profile.children_under_23)
                : "",
            )
          }
          display={
            profile.children_under_23 != null ? (
              <bdi dir="ltr" className="tabular-nums">
                {profile.children_under_23}
              </bdi>
            ) : null
          }
        >
          {editing === "children_under_23" ? (
            <NumberEditor
              label="מספר ילדים"
              value={draft}
              disabled={saving}
              step="1"
              onChange={setDraft}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />
          ) : null}
        </ProfileRow>

        <ProfileRow
          label="רכב נוכחי"
          missing={currentMissing}
          readOnly
          display={current ? currentVehicleLabel(current) : null}
        />

        {current?.kind === "car" && (
          <ProfileRow
            label="השתתפות חודשית"
            missing={participationMissing}
            editing={editing === "current.participation"}
            saving={saving}
            onStartEdit={() =>
              startEdit(
                "current.participation",
                current.participation != null ? String(current.participation) : "",
              )
            }
            display={
              current.participation != null ? (
                <MoneyValue amount={current.participation} />
              ) : null
            }
          >
            {editing === "current.participation" ? (
              <NumberEditor
                label="השתתפות חודשית"
                value={draft}
                disabled={saving}
                onChange={setDraft}
                onSave={saveEdit}
                onCancel={cancelEdit}
              />
            ) : null}
          </ProfileRow>
        )}

        {current?.kind === "waiver" && (
          <ProfileRow
            label="אחזקה חודשית"
            missing={false}
            editing={editing === "current.maintenance"}
            saving={saving}
            onStartEdit={() =>
              startEdit("current.maintenance", String(current.maintenance))
            }
            display={<MoneyValue amount={current.maintenance} />}
          >
            {editing === "current.maintenance" ? (
              <NumberEditor
                label="אחזקה חודשית"
                value={draft}
                disabled={saving}
                onChange={setDraft}
                onSave={saveEdit}
                onCancel={cancelEdit}
              />
            ) : null}
          </ProfileRow>
        )}

        {confirmed.map(([catalogId, amount]) => (
          <ProfileRow
            key={catalogId}
            label={`השתתפות מאושרת · ${catalogId}`}
            missing={false}
            readOnly
            display={<MoneyValue amount={amount} />}
          />
        ))}
      </div>

      <div className="mt-auto shrink-0 border-t border-border px-5 py-3" aria-live="polite">
        {saving && <p className="text-sm text-muted-foreground">שומר…</p>}
        {errorMessage && !saving && (
          <p role="alert" className="text-sm text-error">
            {errorMessage}
          </p>
        )}
        {!saving && !errorMessage && (
          <p className="text-xs text-muted-foreground">
            לחצו על שדה כדי לערוך. Enter לשמירה, Escape לביטול.
          </p>
        )}
      </div>
    </section>
  );
}

function ProfileRow({
  label,
  missing,
  display,
  editing = false,
  saving = false,
  readOnly = false,
  onStartEdit,
  children,
}: {
  label: string;
  missing: boolean;
  display?: ReactNode;
  editing?: boolean;
  saving?: boolean;
  readOnly?: boolean;
  onStartEdit?: () => void;
  children?: ReactNode;
}) {
  const status = missing ? (
    <span className="text-sm font-bold text-error">חסר</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm text-success" aria-label="מולא">
      <Check aria-hidden className="size-4" strokeWidth={3} />
      <span className="sr-only">מולא</span>
    </span>
  );

  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{label}</span>
            {status}
          </div>
          {editing ? (
            children
          ) : readOnly || !onStartEdit ? (
            <p className={cn("mt-1 font-semibold break-words", missing && "text-error")}>
              {missing ? "חסר" : display}
            </p>
          ) : (
            <button
              type="button"
              onClick={onStartEdit}
              disabled={saving}
              className={cn(
                "mt-1 block min-h-11 w-full border-b border-transparent py-2 text-start font-semibold break-words",
                "hover:border-border focus-visible:border-cobalt focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
                missing && "text-error",
              )}
              aria-label={`עריכת ${label}`}
            >
              {missing ? "חסר — לחצו למילוי" : display}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NumberEditor({
  label,
  value,
  disabled,
  step = "1",
  onChange,
  onSave,
  onCancel,
}: {
  label: string;
  value: string;
  disabled: boolean;
  step?: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <FieldEditor
      kind="number"
      label={label}
      value={value}
      disabled={disabled}
      step={step}
      onChange={onChange}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

function FieldEditor({
  kind,
  label,
  value,
  disabled,
  options,
  loading,
  step,
  onChange,
  onSave,
  onCancel,
}: {
  kind: "number" | "text" | "select";
  label: string;
  value: string;
  disabled: boolean;
  options?: { value: string; label: string }[];
  loading?: boolean;
  step?: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onSave();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }

  const fieldClass =
    "mt-2 w-full min-w-0 max-w-full border-0 border-b-2 border-border bg-transparent py-2 text-base font-semibold focus-visible:border-cobalt focus-visible:outline-none";

  return (
    <div className="mt-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      {kind === "select" ? (
        <select
          id={id}
          ref={ref as RefObject<HTMLSelectElement>}
          value={value}
          disabled={disabled || loading}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={fieldClass}
          aria-label={label}
        >
          <option value="">{loading ? "טוען…" : "בחרו עיסוק"}</option>
          {(options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          ref={ref as RefObject<HTMLInputElement>}
          type={kind}
          inputMode={kind === "number" ? "decimal" : undefined}
          step={kind === "number" ? step : undefined}
          min={kind === "number" ? 0 : undefined}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={fieldClass}
          aria-label={label}
        />
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={disabled}
          className="min-h-11 border border-transparent bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-(--primary-hover) focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-45"
        >
          {disabled ? "שומר…" : "שמירה"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="min-h-11 border border-border bg-surface px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
