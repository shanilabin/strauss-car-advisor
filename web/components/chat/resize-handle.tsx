"use client";

import { GripVertical } from "lucide-react";
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const MIN = 280;
const STEP = 32;

function readWidth(key: string, fallback: number, maxShare: number): number {
  const max = Math.max(MIN, Math.round(window.innerWidth * maxShare)); // saved on a bigger screen? fit this one
  try {
    const saved = Number(window.localStorage.getItem(key));
    return Math.min(max, Number.isFinite(saved) && saved >= MIN ? saved : fallback);
  } catch {
    return Math.min(max, fallback); // storage blocked: just the default width
  }
}

/**
 * A width the employee sets by dragging (or with the arrow keys), remembered in this browser, at most
 * `maxShare` of the window so the panel beside it keeps room for its numbers.
 */
export function useResizableWidth(key: string, fallback: number, maxShare = 0.6) {
  const [width, setWidthState] = useState<number>(() =>
    typeof window === "undefined" ? fallback : readWidth(key, fallback, maxShare),
  );
  const setWidth = useCallback(
    (next: number) => {
      const max = Math.max(MIN, Math.round(window.innerWidth * maxShare));
      const clamped = Math.min(max, Math.max(MIN, Math.round(next)));
      setWidthState(clamped);
      try {
        window.localStorage.setItem(key, String(clamped));
      } catch {
        // not remembered - fine
      }
    },
    [key, maxShare],
  );
  return [width, setWidth] as const;
}

/** The bar between the chat and the panel next to it: drag it, or focus it and use the arrow keys. */
export function ResizeHandle({
  width,
  onWidth,
  grows,
  label = "שינוי רוחב הצ'אט",
}: {
  width: number;
  onWidth: (width: number) => void;
  /** Which way the chat gets wider: the handle moving "left" or "right" on screen. */
  grows: "left" | "right";
  label?: string;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);

  function down(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, width };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const moved = event.clientX - start.current.x;
    onWidth(start.current.width + (grows === "right" ? moved : -moved));
  }

  function up() {
    start.current = null;
  }

  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const towardGrowth = (event.key === "ArrowRight") === (grows === "right");
    onWidth(width + (towardGrowth ? STEP : -STEP));
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={MIN}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      title="גררו כדי להגדיל או להקטין את הצ'אט"
      className="group flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center self-stretch rounded-full hover:bg-mist focus-visible:bg-mist focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <GripVertical aria-hidden className="size-4 text-muted-foreground/60 group-hover:text-primary" />
    </div>
  );
}
