"use client";

import { useQuery } from "@tanstack/react-query";
import { CarFront, ChevronLeft, MessageCirclePlus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDateTime } from "@/lib/format";
import { displayName, useSession } from "@/lib/supabase/use-session";
import { cn } from "@/lib/utils";

type Item = components["schemas"]["ConversationListItem"];

const STATUS: Record<Item["status"], { label: string; tone: string }> = {
  COLLECTING: { label: "באמצע איסוף פרטים", tone: "bg-mist text-primary" },
  READY: { label: "מוכן להשוואה", tone: "bg-mist text-primary" },
  PRESENTED: { label: "יש השוואה", tone: "bg-success-surface text-success" },
  WAITING_REP: { label: "ממתין לנציג", tone: "bg-pending-surface text-pending" },
};

/** "My conversations": pick up where you left off - on any device, since they belong to the account. */
export function MyConversations() {
  const { session } = useSession();
  const list = useQuery({
    queryKey: ["conversations", "mine"] as const,
    enabled: Boolean(session),
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await api.GET("/v1/conversations");
      if (error || !data) throw new Error("לא הצלחנו לטעון את השיחות שלך.");
      return data;
    },
  });
  const name = displayName(session);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center gap-4">
        <Image src="/brand/mascot-guide.webp" alt="" width={514} height={520} className="h-auto w-16" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl sm:text-4xl">{name ? <>שלום, <bdi>{name}</bdi></> : "השיחות שלי"}</h1>
          <p className="text-muted-foreground">השיחות שלך נשמרות. אפשר להמשיך כל אחת מהן מאיפה שעצרת.</p>
        </div>
        <Link
          href="/c/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-(--primary-hover)"
        >
          <MessageCirclePlus aria-hidden className="size-4" />
          שיחה חדשה
        </Link>
      </header>

      {list.isPending && <p className="text-muted-foreground" aria-busy="true">טוען את השיחות…</p>}
      {list.isError && (
        <p role="alert" className="rounded-2xl border border-error-border bg-error-surface px-4 py-3 text-sm text-error">
          {list.error.message}
        </p>
      )}
      {list.data && list.data.length === 0 && (
        <p className="rounded-3xl border border-dashed border-border bg-surface px-6 py-10 text-center text-muted-foreground">
          עוד אין לך שיחות. אפשר להתחיל שיחה עם היועץ, או לנסות עם עובד לדוגמה במצב טופס.
        </p>
      )}
      {list.data && list.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {list.data.map((item) => {
            const status = STATUS[item.status];
            return (
              <li key={item.id}>
                <Link
                  href={`/c/${item.id}`}
                  className="flex items-center gap-4 rounded-3xl border border-border/70 bg-surface px-5 py-4 shadow-soft transition-colors hover:border-primary/50 hover:shadow-card"
                >
                  <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-mist text-primary">
                    <CarFront className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-bold">
                      {item.current_car ? <bdi>{item.current_car}</bdi> : "שיחה חדשה"}
                      {item.occupation && <span className="font-normal text-muted-foreground"> · {item.occupation}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">עודכן ב-{formatDateTime(item.updated_at)}</span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-bold", status.tone)}>{status.label}</span>
                  <ChevronLeft aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
