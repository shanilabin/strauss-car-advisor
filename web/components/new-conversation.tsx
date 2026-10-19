"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import {
  CreateConversationError,
  useCreateConversation,
} from "@/lib/api/use-create-conversation";
import { useSession } from "@/lib/supabase/use-session";

/**
 * Opens one real conversation and replaces this route with /c/{id}.
 *
 * With cacheComponents, Next keeps a left page alive but hidden (React Activity) and shows it again on
 * the next visit: effects are torn down on hide and run again on show, while refs survive. So the
 * "start" lives in the effect itself (a timer its cleanup cancels) - every visit opens a new
 * conversation, and Strict Mode's double run in dev still starts only one.
 */
const SLOW_AFTER_MS = 15_000;

export function NewConversation() {
  const router = useRouter();
  const session = useSession();
  const createConversation = useCreateConversation();
  const { mutate } = createConversation;
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!session.session) return;
    const start = window.setTimeout(() => {
      setSlow(false);
      mutate(
        {},
        {
          onSuccess: (state) => {
            router.replace(`/c/${state.id}`);
          },
        },
      );
    }, 0);
    // Never wait forever: after a while, offer to try again.
    const tooLong = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(tooLong);
    };
  }, [mutate, router, session.session]);

  function retry() {
    if (!session.session || createConversation.isPending) return;
    mutate(
      {},
      {
        onSuccess: (state) => {
          router.replace(`/c/${state.id}`);
        },
      },
    );
  }

  if (session.error) {
    return (
      <StatusShell>
        <h1 className="font-display text-3xl">לא הצלחנו להתחבר</h1>
        <p role="alert" className="text-error">
          {session.error}
        </p>
        <Button type="button" onClick={() => window.location.reload()}>
          נסו שוב
        </Button>
      </StatusShell>
    );
  }

  if (createConversation.isError) {
    const message =
      createConversation.error instanceof CreateConversationError
        ? createConversation.error.message
        : "לא הצלחנו לפתוח שיחה. נסו שוב.";
    return (
      <StatusShell>
        <h1 className="font-display text-3xl">לא הצלחנו לפתוח שיחה</h1>
        <p role="alert" className="text-error">
          {message}
        </p>
        <Button type="button" onClick={retry} disabled={createConversation.isPending}>
          נסו שוב
        </Button>
      </StatusShell>
    );
  }

  if (slow) {
    return (
      <StatusShell>
        <h1 className="font-display text-3xl">זה לוקח יותר מהרגיל</h1>
        <p className="text-muted-foreground">החיבור לשרת איטי כרגע. אפשר לנסות שוב.</p>
        <Button type="button" onClick={() => window.location.reload()}>
          נסו שוב
        </Button>
      </StatusShell>
    );
  }

  return (
    <StatusShell>
      <p aria-busy="true" className="text-muted-foreground">
        פותחים שיחה…
      </p>
    </StatusShell>
  );
}

function StatusShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Topbar step={null} />
      <main className="mx-auto flex w-full min-w-0 max-w-screen-md flex-1 flex-col justify-center gap-4 overflow-x-clip px-4 py-16 sm:px-5">
        {children}
      </main>
    </>
  );
}
