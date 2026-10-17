"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { RepQueue } from "@/components/rep-queue";
import { Topbar } from "@/components/topbar";
import { useRepSession } from "@/lib/supabase/use-rep-session";

/**
 * Rep home: requires a REP session (separate storage key). Never starts an anonymous employee session.
 */
export function RepScreen() {
  const router = useRouter();
  const { session, loading, error } = useRepSession();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/rep/login");
    }
  }, [loading, session, router]);

  if (loading) {
    return (
      <>
        <Topbar step={null} />
        <main className="flex flex-1 items-center justify-center px-5 py-16 text-muted-foreground">
          בודקים התחברות…
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Topbar step={null} />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-5 py-16">
          <p role="alert" className="border border-error-border bg-error-surface px-3 py-2.5 text-sm text-error">
            {error}
          </p>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <Topbar step={null} />
        <main className="flex flex-1 items-center justify-center px-5 py-16 text-muted-foreground">
          מעבירים להתחברות…
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar step={null} />
      <main className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <RepQueue enabled />
      </main>
    </>
  );
}
