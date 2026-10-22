"use client";

import { LoaderCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useSession } from "@/lib/supabase/use-session";

/** The pages of the company's internal system. The landing page and /login stay open to everyone. */
function needsSignIn(pathname: string): boolean {
  return pathname === "/form" || pathname === "/c" || pathname.startsWith("/c/");
}

/**
 * Signed out on a protected page -> /login, and back here after signing in (?next=). The API refuses an
 * anonymous or missing session as well; this only spares the employee the error.
 */
export function SignInGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, loading } = useSession();
  const gated = needsSignIn(pathname);
  const blocked = gated && !loading && !session;

  useEffect(() => {
    if (blocked) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [blocked, pathname, router]);

  if (gated && (loading || !session)) return <SignInWait text={loading ? "בודקים התחברות…" : "מעבירים לכניסה…"} />;
  return <>{children}</>;
}

/** The "checking / redirecting" placeholder, also the Suspense fallback of the employee layout. */
export function SignInWait({ text }: { text: string }) {
  return (
    <main className="flex flex-1 items-center justify-center gap-2 px-5 py-16 text-muted-foreground" aria-busy="true">
      <LoaderCircle aria-hidden className="size-5 animate-spin" />
      {text}
    </main>
  );
}
