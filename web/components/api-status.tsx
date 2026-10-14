"use client";

import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { useEffect, useState } from "react";

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

  if (state.kind === "loading") {
    return (
      <p className="flex items-center gap-1.5">
        <CircleDashed aria-hidden className="size-3.5" />
        בודק חיבור לשרת…
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <p className="flex items-center gap-1.5">
        <CircleX aria-hidden className="size-3.5 text-error" />
        השרת לא זמין
      </p>
    );
  }

  const { health } = state;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex items-center gap-1.5">
        <CircleCheck aria-hidden className="size-3.5 text-success" />
        השרת מחובר
      </span>
      <span>
        גרסה <bdi>{health.version}</bdi>
      </span>
      {Object.entries(health.configured).map(([name, ok]) => (
        <span key={name}>
          <bdi>{name}</bdi>: {ok ? "מוגדר" : "לא מוגדר"}
        </span>
      ))}
    </p>
  );
}
