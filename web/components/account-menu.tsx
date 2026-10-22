"use client";

import { History, LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getSupabase } from "@/lib/supabase/client";
import { displayName, useSession } from "@/lib/supabase/use-session";

/** The top bar's account corner: "sign in", or the name with "my conversations" and "sign out". */
export function AccountMenu() {
  const router = useRouter();
  const { session, loading } = useSession();

  if (loading) return null;
  if (!session) {
    return (
      <Link
        href="/login"
        className="inline-flex h-11 items-center gap-2 rounded-full border border-nav-border bg-surface px-4 text-sm font-semibold transition-colors hover:border-primary hover:bg-mist"
      >
        <LogIn aria-hidden className="size-4 text-primary" />
        התחברות
      </Link>
    );
  }

  const name = displayName(session);
  return (
    <div className="flex items-center gap-1.5">
      <Link
        href="/c"
        className="inline-flex h-11 items-center gap-2 rounded-full border border-nav-border bg-surface px-3 text-sm font-semibold transition-colors hover:border-primary hover:bg-mist"
        title="השיחות שלי"
      >
        <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-full bg-mist text-sm font-extrabold text-primary">
          {name?.[0] ?? "?"}
        </span>
        <span className="max-lg:sr-only">
          <bdi>{name}</bdi>
        </span>
        <History aria-hidden className="size-4 text-primary lg:hidden" />
        <span className="sr-only lg:not-sr-only lg:text-muted-foreground">· השיחות שלי</span>
      </Link>
      <button
        type="button"
        onClick={async () => {
          await getSupabase("employee").auth.signOut();
          router.replace("/");
        }}
        aria-label="התנתקות"
        title="התנתקות"
        className="inline-flex size-11 items-center justify-center rounded-full border border-nav-border bg-surface transition-colors hover:border-primary hover:bg-mist"
      >
        <LogOut aria-hidden className="size-4 text-primary rtl:-scale-x-100" />
      </button>
    </div>
  );
}
