"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BadgePercent,
  Briefcase,
  CarFront,
  Check,
  CircleDot,
  Coins,
  Gift,
  GraduationCap,
  Layers,
  type LucideIcon,
  Pencil,
  PiggyBank,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import {
  createContext,
  useContext,
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
type Vehicle = components["schemas"]["Vehicle"];
type WaiverArrangement = components["schemas"]["WaiverArrangement"];

type ProfileCardProps = {
  conversationId: string;
  profile: Profile;
  missing?: MissingField[];
  /** A comparison is on screen: saving a field recomputes it (the footer says so). */
  recalculates?: boolean;
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

type EditableKey = Exclude<FieldKey, "group">;

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

/** The open editor's error, shown right under its field (one field is edited at a time). */
const EditError = createContext<string | null>(null);

/**
 * The limits are the API's own (Profile / Deductions validation), checked here first so the message
 * sits next to the field and names the range (QA UX08).
 */
const LIMITS: Record<string, { min: number; max?: number; integer?: boolean; positive?: boolean }> = {
  "salary.base": { min: 0, positive: true },
  "salary.commissions": { min: 0 },
  "salary.bonus": { min: 0 },
  "deductions.pension_pct": { min: 0, max: 100 },
  "deductions.study_fund_pct": { min: 0, max: 100 },
  "deductions.credit_points": { min: 0, max: 30 },
  children_under_23: { min: 0, max: 30, integer: true },
  "current.participation": { min: 0 },
  "current.maintenance": { min: 0 },
};

/** A number, or the reason it can't be saved. An empty field is never read as 0 (QA B04). */
function parseField(field: string, raw: string): number | string {
  const trimmed = raw.trim();
  if (!trimmed) return "השדה ריק. נא להזין ערך (0 אם אין).";
  const n = Number(trimmed);
  const limit = LIMITS[field] ?? { min: 0 };
  if (!Number.isFinite(n)) return "נא להזין מספר.";
  if (limit.integer && !Number.isInteger(n)) return "נא להזין מספר שלם.";
  if (limit.positive && n <= 0) return "שכר הבסיס חייב להיות גדול מ-0.";
  if (n < limit.min || (limit.max != null && n > limit.max)) {
    return limit.max != null
      ? `נא להזין ערך בין ${limit.min} ל-${limit.max}.`
      : `נא להזין ערך של ${limit.min} ומעלה.`;
  }
  return n;
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
  recalculates = false,
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

    const n = parseField(field, raw);
    if (typeof n === "string") {
      setLocalError(n);
      return null;
    }

    if (field === "children_under_23") {
      return { expected_revision, children_under_23: n };
    }

    if (field.startsWith("salary.")) {
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
  // The engine takes the group from the occupation table (a stated group is never trusted), so the
  // card shows that one - also when profile.group was never set.
  const group =
    occupations.data?.find((o) => o.name === profile.occupation)?.group ??
    profile.group ??
    null;
  const groupMissing = isFieldMissing(keys, "group", Boolean(group));
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
    <EditError.Provider value={editing ? errorMessage : null}>
      <section
        aria-label="פרופיל עובד"
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-x-clip overflow-y-auto rounded-3xl border border-border/70 bg-surface shadow-card",
          className,
        )}
      >
        <header className="shrink-0 px-5 pt-5 pb-3">
          <h2 className="flex items-center gap-2 text-xl font-extrabold">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-mist text-primary">
              <UserRound aria-hidden className="size-5" />
            </span>
            הפרטים שלי
          </h2>
          <div className="mt-4 flex flex-col items-center text-center">
            <span className="inline-flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-sky to-mist text-primary ring-4 ring-mist">
              <UserRound aria-hidden className="size-9" />
            </span>
            <p className="mt-2 text-lg font-bold">עובד/ת שטראוס</p>
            {missing.length > 0 ? (
              <p className="mt-1 rounded-full bg-pending-surface px-3 py-0.5 text-sm font-semibold text-pending">
                חסרים עוד {missing.length} פרטים
              </p>
            ) : (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-success-surface px-3 py-0.5 text-sm font-semibold text-success">
                <Check aria-hidden className="size-4" strokeWidth={3} />
                הפרופיל מלא
              </p>
            )}
          </div>
        </header>

        <div className="mx-4 mb-3 flex flex-col rounded-2xl border border-border/70 px-3">
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
            display={group ? formatGroupLabel(group) : null}
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
            editing={editing === "current"}
            saving={saving}
            onStartEdit={() => startEdit("current", "")}
            display={current ? currentVehicleLabel(current) : null}
          >
            {editing === "current" ? (
              <CurrentCarEditor
                maintenance={
                  occupations.data?.find((o) => o.name === profile.occupation)?.maintenance ?? null
                }
                participation={current?.kind === "car" ? (current.participation ?? null) : null}
                disabled={saving}
                onSave={(next) => {
                  setLocalError(null);
                  patchProfile.mutate(
                    { expected_revision: profile.revision, current: next },
                    { onSuccess: () => cancelEdit() },
                  );
                }}
                onError={setLocalError}
                onCancel={cancelEdit}
              />
            ) : null}
          </ProfileRow>

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

        <div className="mt-auto shrink-0 border-t border-border/70 px-5 py-3" aria-live="polite">
          {saving && <p className="text-sm text-muted-foreground">שומר…</p>}
          {errorMessage && !saving && !editing && (
            <p role="alert" className="text-sm text-error">
              {errorMessage}
            </p>
          )}
          {!saving && (!errorMessage || editing) && (
            <p className="text-xs text-muted-foreground">
              לחצו על שדה כדי לערוך. Enter לשמירה, Escape לביטול.
              {recalculates && " כל שינוי מחשב מחדש את ההשוואה."}
            </p>
          )}
        </div>
      </section>
    </EditError.Provider>
  );
}

const ROW_ICONS: Record<string, LucideIcon> = {
  עיסוק: Briefcase,
  קבוצת: Layers,
  שכר: Wallet,
  עמלות: TrendingUp,
  בונוס: Gift,
  פנסיה: PiggyBank,
  קרן: GraduationCap,
  נקודות: BadgePercent,
  מספר: Users,
  רכב: CarFront,
  השתתפות: Coins,
  default: CircleDot,
};

function RowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-mist text-primary">
      <Icon className="size-4" />
    </span>
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
  const Icon = ROW_ICONS[label.split(" ")[0]] ?? ROW_ICONS.default;
  const value = missing ? (
    <span className="inline-flex items-center rounded-full bg-pending-surface px-2.5 py-0.5 text-xs font-bold text-pending">
      חסר
    </span>
  ) : (
    <span className="font-semibold break-words">{display}</span>
  );

  return (
    <div className="border-b border-border/70 py-1 last:border-b-0">
      {editing ? (
        <div className="py-2">
          <div className="flex items-center gap-3">
            <RowIcon icon={Icon} />
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
          {children}
        </div>
      ) : readOnly || !onStartEdit ? (
        <div className="flex min-h-12 items-center gap-3">
          <RowIcon icon={Icon} />
          <span className="flex-1 text-sm text-muted-foreground">{label}</span>
          <span className="max-w-[55%] text-end">{value}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          disabled={saving}
          className="group/row flex min-h-12 w-full items-center gap-3 rounded-xl text-start transition-colors hover:bg-mist/60 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={missing ? `מילוי ${label}` : `עריכת ${label}`}
        >
          <RowIcon icon={Icon} />
          <span className="flex-1 text-sm text-muted-foreground">{label}</span>
          <span className="max-w-[55%] text-end">{value}</span>
          <Pencil aria-hidden className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100" />
        </button>
      )}
    </div>
  );
}

/**
 * Today's car (QA UX06): a car searched in the Tax Authority data (the server re-reads it by its key
 * and matches it to the catalog), or no car and the occupation's maintenance from the config.
 */
function CurrentCarEditor({
  maintenance,
  participation,
  disabled,
  onSave,
  onError,
  onCancel,
}: {
  maintenance: number | null;
  participation: number | null;
  disabled: boolean;
  onSave: (current: CarArrangement | WaiverArrangement) => void;
  onError: (message: string | null) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const error = useContext(EditError);
  const [mode, setMode] = useState<"car" | "waiver">("car");
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [found, setFound] = useState<Vehicle[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [pays, setPays] = useState(participation != null ? String(participation) : "");

  async function search() {
    onError(null);
    if (query.trim().length < 2) {
      onError("נא להזין לפחות 2 אותיות משם הדגם, באנגלית (למשל corolla).");
      return;
    }
    const regYear = year.trim() ? Number(year) : null;
    if (regYear != null && (!Number.isInteger(regYear) || regYear < 1990 || regYear > 2100)) {
      onError("שנת רישום בין 1990 ל-2100.");
      return;
    }
    setSearching(true);
    setChosen(null);
    const { data, error: failed } = await api.GET("/v1/vehicles/search", {
      params: { query: { q: query.trim(), reg_year: regYear } },
    });
    setSearching(false);
    if (failed || !data) {
      onError("החיפוש נכשל. נסו שוב.");
      return;
    }
    setFound(data);
  }

  function save() {
    onError(null);
    if (mode === "waiver") {
      if (maintenance == null) {
        onError("קודם בחרו עיסוק: האחזקה נקבעת לפי העיסוק.");
        return;
      }
      onSave({ kind: "waiver", maintenance });
      return;
    }
    const vehicle = chosen != null ? found?.[chosen] : undefined;
    if (!vehicle) {
      onError("חפשו את הרכב ובחרו אותו מהרשימה.");
      return;
    }
    const amount = parseField("current.participation", pays);
    if (typeof amount === "string") {
      onError(`השתתפות חודשית: ${amount}`);
      return;
    }
    onSave({ kind: "car", vehicle, participation: amount, participation_status: "CONFIRMED" });
  }

  const inputClass =
    "w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-base focus-visible:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <div className="mt-2 flex flex-col gap-3">
      <div role="radiogroup" aria-label="מה יש לי היום" className="flex gap-1 rounded-full bg-mist p-1">
        {(
          [
            ["car", "רכב חברה"],
            ["waiver", "אין רכב (אחזקה)"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "min-h-10 flex-1 rounded-full px-3 text-sm font-bold",
              mode === value ? "bg-surface shadow-soft" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "car" ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              דגם (באנגלית)
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void search();
                  }
                }}
                dir="ltr"
                placeholder="corolla cross"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              שנת רישום
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                inputMode="numeric"
                dir="ltr"
                placeholder="2025"
                className={inputClass}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void search()}
            disabled={disabled || searching}
            className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted disabled:opacity-45"
          >
            {searching ? "מחפש…" : "חיפוש במאגר רשות המסים"}
          </button>
          {found && found.length === 0 && (
            <p className="text-sm text-muted-foreground">לא נמצא. נסו שם אחר או בלי שנה, או כתבו לבוט בצ&apos;אט.</p>
          )}
          {found && found.length > 0 && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-xs text-muted-foreground">בחרו את הרכב שלך</legend>
              {found.map((v, index) => (
                <label
                  key={`${v.key.maker_code}-${v.key.model_code}-${v.key.reg_year}-${v.key.vehicle_type_code}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm",
                    chosen === index ? "border-primary bg-mist" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-car`}
                    checked={chosen === index}
                    onChange={() => setChosen(index)}
                    className="mt-1 accent-primary"
                  />
                  <span className="min-w-0">
                    <bdi className="font-bold">
                      {v.maker_name} {v.commercial_name} ({v.key.reg_year})
                    </bdi>
                    <bdi className="block text-xs text-muted-foreground">{v.model_desc}</bdi>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            כמה את/ה משלם/ת היום בחודש על הרכב (השתתפות)
            <input
              value={pays}
              onChange={(e) => setPays(e.target.value)}
              inputMode="decimal"
              dir="ltr"
              className={inputClass}
            />
          </label>
        </>
      ) : (
        <p className="text-sm">
          {maintenance != null ? (
            <>
              אחזקת הרכב לפי העיסוק שלך: <MoneyValue amount={maintenance} />
            </>
          ) : (
            "קודם בחרו עיסוק: האחזקה נקבעת לפי העיסוק."
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={disabled}
          className="min-h-11 rounded-full border border-transparent bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-(--primary-hover) disabled:opacity-45"
        >
          {disabled ? "שומר…" : "שמירה"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="min-h-11 rounded-full border border-border bg-surface px-5 text-sm font-semibold hover:bg-muted"
        >
          ביטול
        </button>
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
  const errorId = `${id}-error`;
  const error = useContext(EditError);
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
    "mt-2 w-full min-w-0 max-w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base font-semibold focus-visible:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";

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
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
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
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-semibold text-error">
          {error}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={disabled}
          className="min-h-11 rounded-full border border-transparent bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-(--primary-hover) focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-45"
        >
          {disabled ? "שומר…" : "שמירה"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="min-h-11 rounded-full border border-border bg-surface px-5 text-sm font-semibold hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
