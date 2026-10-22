"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, CarFront, CheckCheck, Clock, Inbox, type LucideIcon, Timer } from "lucide-react";
import type { ReactNode } from "react";

import { repApi } from "@/lib/api/client";
import type { RepQuestionOut } from "@/lib/api/use-rep-questions";
import { cn } from "@/lib/utils";

const TOP = 5;
const POLL_MS = 30_000;

/**
 * The transport desk at a glance: how many questions, how fast they are answered, which cars employees
 * want and from which jobs. Counted from the rep's own question list - no salary, no chat, no money.
 */
export function RepInsights() {
  const query = useQuery({
    queryKey: ["rep", "questions", "ALL"] as const,
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<RepQuestionOut[]> => {
      const { data, error } = await repApi.GET("/v1/rep/questions");
      if (error || !data) throw new Error("לא הצלחנו לטעון את הנתונים.");
      return data;
    },
  });

  if (query.isPending) return <p className="px-5 py-16 text-center text-muted-foreground">טוען נתונים…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="mx-auto max-w-lg rounded-2xl border border-error-border bg-error-surface px-3 py-2.5 text-sm text-error">
        {query.error.message}
      </p>
    );
  }

  const questions = query.data;
  const open = questions.filter((q) => q.status === "OPEN").length;
  const answered = questions.filter((q) => q.answer != null);
  const waits = answered
    .map((q) => new Date(q.answer!.answered_at).getTime() - new Date(q.created_at).getTime())
    .filter((ms) => ms >= 0);
  const cars = topCounts(questions.map((q) => q.context?.requested_car));
  const jobs = topCounts(questions.map((q) => q.context?.occupation));
  const participation = questions.filter((q) => q.field.startsWith("participation:")).length;

  if (questions.length === 0) {
    return (
      <div className="rounded-3xl border border-border/70 bg-surface px-5 py-16 text-center shadow-card">
        <p className="text-lg font-bold">עוד אין שאלות</p>
        <p className="mt-1 text-sm text-muted-foreground">כשעובדים ישאלו, תמונת המצב תתמלא כאן.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Inbox} label="שאלות בסך הכל" value={String(questions.length)} />
        <Stat icon={Clock} label="ממתינות לתשובה" value={String(open)} tone={open > 0 ? "text-pending" : undefined} />
        <Stat icon={CheckCheck} label="נענו" value={String(answered.length)} tone="text-success" />
        <Stat icon={Timer} label="זמן תשובה חציוני" value={waits.length ? duration(median(waits)) : "—"} />
      </dl>
      <div className="grid gap-5 lg:grid-cols-2">
        <Ranking icon={CarFront} title="הרכבים שהכי מבקשים" rows={cars} total={questions.length} />
        <Ranking icon={BarChart3} title="מאילו תפקידים שואלים" rows={jobs} total={questions.length} />
      </div>
      <p className="text-sm text-muted-foreground">
        {participation} מתוך {questions.length} השאלות הן אישורי השתתפות ברכב, והשאר אישורי עיסוק. הנתונים מתעדכנים
        מעצמם.
      </p>
    </div>
  );
}

function topCounts(values: (string | undefined)[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "פחות מדקה";
  if (minutes < 60) return minutes === 1 ? "דקה" : `${minutes} דקות`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "שעה" : `${hours} שעות`;
  const days = Math.round(hours / 24);
  return days === 1 ? "יום" : `${days} ימים`;
}

function Stat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-surface px-4 py-4 shadow-soft">
      <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icon aria-hidden className="size-4 text-primary" />
        {label}
      </dt>
      <dd className={cn("mt-1 text-3xl font-black tabular-nums", tone)}>{value}</dd>
    </div>
  );
}

function Ranking({
  icon: Icon,
  title,
  rows,
  total,
}: {
  icon: LucideIcon;
  title: string;
  rows: [string, number][];
  total: number;
}) {
  return (
    <section className="rounded-3xl border border-border/70 bg-surface p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        <Icon aria-hidden className="size-5 text-primary" />
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">אין עדיין נתונים.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2.5">
          {rows.map(([name, count]) => (
            <Bar key={name} label={name} count={count} share={count / total} />
          ))}
        </ol>
      )}
    </section>
  );
}

function Bar({ label, count, share }: { label: ReactNode; count: number; share: number }) {
  return (
    <li className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2 text-sm">
        <bdi className="font-semibold">{label}</bdi>
        <span className="tabular-nums text-muted-foreground">{count}</span>
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-mist">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, share * 100)}%` }} />
      </span>
    </li>
  );
}
