"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import {
  CreateConversationError,
  useCreateConversation,
} from "@/lib/api/use-create-conversation";
import { useSession } from "@/lib/supabase/use-session";

/**
 * Opens one real conversation and replaces this route with /c/{id}.
 * A ref blocks the second effect run under React Strict Mode in dev.
 */
export function NewConversation() {
  const router = useRouter();
  const session = useSession();
  const createConversation = useCreateConversation();
  const started = useRef(false);
  const { mutate } = createConversation;

  useEffect(() => {
    if (!session.session || started.current) return;
    started.current = true;
    mutate(
      {},
      {
        onSuccess: (state) => {
          router.replace(`/c/${state.id}`);
        },
      },
    );
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
      <main className="mx-auto flex w-full max-w-screen-md flex-1 flex-col justify-center gap-4 px-5 py-16">
        {children}
      </main>
    </>
  );
}
