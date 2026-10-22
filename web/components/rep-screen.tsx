"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { RepInsights } from "@/components/rep-insights";
import { RepQueue } from "@/components/rep-queue";
import { Topbar } from "@/components/topbar";
import { useRepSession } from "@/lib/supabase/use-rep-session";
import { cn } from "@/lib/utils";

/**
 * Rep home: requires a REP session (separate storage key). Never starts an anonymous employee session.
 */
export function RepScreen() {
  const router = useRouter();
  const { session, loading, error } = useRepSession();
  const [view, setView] = useState<"queue" | "insights">("queue");

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/rep/login");
    }
  }, [loading, session, router]);

  if (loading) {
    return (
      <>
        <Topbar step={null} area="rep" />
        <main className="flex flex-1 items-center justify-center px-5 py-16 text-muted-foreground">
          בודקים התחברות…
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Topbar step={null} area="rep" />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-5 py-16">
          <p role="alert" className="rounded-2xl border border-error-border bg-error-surface px-3 py-2.5 text-sm text-error">
            {error}
          </p>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <Topbar step={null} area="rep" />
        <main className="flex flex-1 items-center justify-center px-5 py-16 text-muted-foreground">
          מעבירים להתחברות…
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar step={null} area="rep" />
      <main className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <div className="mx-auto flex w-full max-w-screen-2xl justify-end px-4 pt-4 lg:px-8">
          <div role="tablist" aria-label="תצוגה" className="inline-flex rounded-full bg-mist p-1">
            <ViewTab active={view === "queue"} onClick={() => setView("queue")}>
              תור השאלות
            </ViewTab>
            <ViewTab active={view === "insights"} onClick={() => setView("insights")}>
              תמונת מצב
            </ViewTab>
          </div>
        </div>
        {view === "queue" ? (
          <RepQueue enabled />
        ) : (
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 lg:px-8">
            <RepInsights />
          </div>
        )}
      </main>
    </>
  );
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
        active ? "bg-surface text-primary shadow-soft" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
