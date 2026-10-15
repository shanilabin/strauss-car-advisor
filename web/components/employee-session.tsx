"use client";

import { CircleX } from "lucide-react";

import { useSession } from "@/lib/supabase/use-session";

/** Starts the employee's (anonymous) session; renders only when it failed. */
export function EmployeeSession() {
  const { error } = useSession();

  if (!error) return null;
  return (
    <p
      role="alert"
      className="flex items-center gap-2 border-b border-error-border bg-error-surface px-5 py-3 text-sm text-error lg:px-8"
    >
      <CircleX aria-hidden className="size-4 shrink-0" />
      {error}
    </p>
  );
}
