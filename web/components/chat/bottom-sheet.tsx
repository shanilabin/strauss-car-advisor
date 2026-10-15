"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type BottomSheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/** Mobile side-content sheet over the full-screen chat. */
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="סגירה"
        className="fixed inset-0 bg-navy/40"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative flex max-h-[min(85dvh,720px)] flex-col border-t-2 border-lime bg-surface",
          "pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-3">
          <h2 className="font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-border hover:bg-muted"
            aria-label="סגירת הגיליון"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">{children}</div>
      </div>
    </div>
  );
}
