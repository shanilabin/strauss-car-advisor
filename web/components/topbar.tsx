import { Check } from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/** 1 = collecting details, 2 = options, 3 = comparison. Null hides the indicator. */
export type Step = 1 | 2 | 3;

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: "הפרטים שלך" },
  { step: 2, label: "האפשרויות" },
  { step: 3, label: "ההשוואה" },
];

export function Topbar({ step }: { step: Step | null }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 h-(--topbar-h) border-b-2 border-lime bg-nav text-nav-foreground [--ring:var(--nav-ring)]">
      <div className="mx-auto grid h-full max-w-screen-2xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4 lg:grid-cols-[1fr_auto_1fr] lg:px-8">
        <Link
          href="/"
          aria-label="STRAUSS DRIVE - דף הבית"
          className="inline-flex h-11 items-center justify-self-start text-base font-black tracking-wide whitespace-nowrap lg:text-xl"
        >
          <bdi dir="ltr">
            STRAUSS <span className="text-lime">/</span> DRIVE
          </bdi>
        </Link>

        <div className="flex min-w-0 justify-center">{step !== null && <StepIndicator current={step} />}</div>

        <div className="flex items-center justify-self-end">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <nav aria-label="שלבי התהליך">
      <ol className="flex items-center gap-2 text-sm lg:gap-3">
        {STEPS.map(({ step, label }, index) => {
          const state = step < current ? "done" : step === current ? "current" : "upcoming";
          return (
            <li key={step} className="flex items-center gap-2 lg:gap-3">
              {index > 0 && <span aria-hidden className="h-px w-3 bg-nav-border lg:w-6" />}
              <span
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2",
                  state === "current" ? "font-semibold text-nav-foreground" : "text-nav-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-6 items-center justify-center border text-xs font-bold",
                    state === "current" && "border-lime bg-lime text-navy",
                    state === "done" && "border-nav-muted",
                    state === "upcoming" && "border-nav-border",
                  )}
                >
                  {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : step}
                </span>
                <span className={state === "current" ? "max-sm:sr-only" : "max-md:sr-only"}>
                  {label}
                  {state === "done" && <span className="sr-only"> (הושלם)</span>}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
