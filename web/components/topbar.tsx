import { Check, House, MessageCircle, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { AccountMenu } from "@/components/account-menu";
import { NavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/** 1 = collecting details, 2 = options, 3 = comparison. Null shows the site navigation instead. */
export type Step = 1 | 2 | 3;

/** "employee" pages never link to the rep area; the rep area has its own navigation. */
type Area = "employee" | "rep";

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: "הפרטים שלך" },
  { step: 2, label: "האפשרויות" },
  { step: 3, label: "ההשוואה" },
];

const EMPLOYEE_NAV = [
  { href: "/", label: "דף הבית" },
  { href: "/#how", label: "איך זה עובד" },
  { href: "/#faq", label: "שאלות נפוצות" },
  { href: "/form", label: "מצב טופס" },
];

export function Topbar({
  step,
  area = "employee",
  active = "/",
}: {
  step: Step | null;
  area?: Area;
  /** Which navigation item is underlined (employee pages without a step). */
  active?: string;
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 h-(--topbar-h) overflow-x-clip border-b border-nav-border bg-nav/95 text-nav-foreground shadow-soft backdrop-blur-sm [--ring:var(--nav-ring)]">
      <div className="mx-auto grid h-full max-w-screen-2xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 sm:px-5 lg:px-8">
        <Link
          href={area === "rep" ? "/rep" : "/"}
          aria-label="Strauss Drive - דף הבית"
          className="inline-flex h-12 shrink-0 items-center justify-self-start lg:h-14"
        >
          <Image
            src="/brand/logo.webp"
            alt=""
            width={520}
            height={267}
            loading="eager"
            className="h-full w-auto"
          />
        </Link>

        <div className="flex min-w-0 justify-center overflow-hidden">
          {step !== null ? (
            <StepIndicator current={step} />
          ) : area === "rep" ? (
            <NavLinks items={[{ href: "/rep", label: "שאלות פתוחות" }]} active="/rep" />
          ) : (
            <NavLinks items={EMPLOYEE_NAV} active={active} />
          )}
        </div>

        <div className="flex items-center gap-2 justify-self-end">
          <ThemeToggle />
          {area === "rep" ? (
            <span className="hidden h-11 items-center gap-2 rounded-full border border-nav-border bg-surface px-3 text-sm font-semibold sm:inline-flex">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-mist text-primary">
                <UserRound aria-hidden className="size-4" />
              </span>
              נציג/ת תחבורה
            </span>
          ) : step !== null ? (
            <Link
              href="/"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-nav-border bg-surface px-3 text-sm font-semibold transition-colors hover:border-primary hover:bg-mist sm:px-4"
            >
              <House aria-hidden className="size-4 text-primary" />
              <span className="max-sm:sr-only">דף הבית</span>
            </Link>
          ) : (
            (
              <Link
                href="/c/new"
                className="hidden h-11 items-center gap-2 rounded-full border border-nav-border bg-surface px-4 text-sm font-semibold transition-colors hover:border-primary hover:bg-mist xl:inline-flex"
              >
                <MessageCircle aria-hidden className="size-4 text-primary" />
                שיחה עם היועץ
              </Link>
            )
          )}
          {area === "employee" && <AccountMenu />}
        </div>
      </div>
    </header>
  );
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <nav aria-label="שלבי התהליך" className="min-w-0">
      <ol className="flex items-center gap-1 text-xs sm:gap-2 sm:text-sm lg:gap-3">
        {STEPS.map(({ step, label }, index) => {
          const state = step < current ? "done" : step === current ? "current" : "upcoming";
          return (
            <li key={step} className="flex min-w-0 items-center gap-1 sm:gap-2 lg:gap-3">
              {index > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-[3px] w-3 shrink-0 rounded-full sm:w-6 lg:w-10",
                    step <= current ? "bg-primary" : "bg-nav-border",
                  )}
                />
              )}
              <span
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-1.5 rounded-full py-1 ps-1 pe-1 sm:pe-3",
                  state === "current" && "bg-mist font-bold text-nav-foreground",
                  state !== "current" && "text-nav-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    state === "current" && "bg-primary text-primary-foreground",
                    state === "done" && "bg-success text-white dark:text-[#102632]",
                    state === "upcoming" && "border border-nav-border bg-surface",
                  )}
                >
                  {state === "done" ? <Check className="size-4" strokeWidth={3} /> : step}
                </span>
                <span
                  className={cn(
                    "truncate",
                    state === "current" ? "max-sm:sr-only" : "max-lg:sr-only",
                  )}
                >
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
