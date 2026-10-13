"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";

type Health = {
  status: string;
  version: string;
  engine_version: string;
  configured: Record<string, boolean>;
};

type State = { kind: "loading" } | { kind: "ok"; health: Health } | { kind: "error" };

/** Smoke check for the deployment: the browser calls /api/health, which Next rewrites to the FastAPI app. */
export function ApiStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((health: Health) => setState({ kind: "ok", health }))
      .catch(() => setState({ kind: "error" }));
  }, []);

  if (state.kind === "loading") return <Badge variant="secondary">בודק חיבור לשרת…</Badge>;
  if (state.kind === "error") return <Badge variant="destructive">השרת לא זמין</Badge>;

  const { health } = state;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge>API: תקין ✓</Badge>
      <span className="text-muted-foreground">גרסה {health.version}</span>
      {Object.entries(health.configured).map(([name, ok]) => (
        <Badge key={name} variant={ok ? "outline" : "secondary"}>
          {name} {ok ? "✓" : "—"}
        </Badge>
      ))}
    </div>
  );
}
