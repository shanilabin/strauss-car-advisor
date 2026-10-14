import { ArrowLeft, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { LandingDemo } from "@/components/landing-demo";
import { Topbar } from "@/components/topbar";
import { buttonVariants } from "@/components/ui/button";

const enterAt = (index: number) => ({ "--enter-index": index }) as CSSProperties;

export default function Home() {
  return (
    <>
      <Topbar step={null} />
      <main className="mx-auto grid w-full max-w-screen-xl flex-1 items-center gap-12 px-5 py-10 sm:py-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:px-8 lg:py-20">
        <section aria-labelledby="landing-title">
          <p className="enter text-sm font-bold text-link" style={enterAt(0)}>
            יועץ הרכב של שטראוס
          </p>
          <h1
            id="landing-title"
            className="enter mt-4 font-display text-[2.5rem] leading-[1.08] sm:text-6xl xl:text-7xl"
            style={enterAt(1)}
          >
            ההחלטה על הרכב.
            <br />
            ברורה במספרים.
          </h1>
          <p className="enter mt-6 max-w-xl text-lg text-muted-foreground lg:text-xl" style={enterAt(2)}>
            מה יקרה לנטו שלכם אם תעברו לרכב חשמלי, תחליפו רכב או תוותרו על הרכב?
          </p>
          <div className="enter mt-8 flex flex-wrap gap-3" style={enterAt(3)}>
            <Link href="/c/new" className={buttonVariants({ size: "lg" })}>
              בואו נתחיל
              <ArrowLeft aria-hidden data-icon="inline-end" />
            </Link>
            <Link href="/c/new" className={buttonVariants({ size: "lg", variant: "outline" })}>
              <Users aria-hidden data-icon="inline-start" />
              נסו עם עובד לדוגמה
            </Link>
          </div>
          <p
            className="enter mt-8 flex max-w-xl items-start gap-2 border-s-2 border-primary ps-3 text-sm text-muted-foreground"
            style={enterAt(4)}
          >
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground" />
            החישוב נעשה לפי כללי החברה ונתוני רשות המסים. המספרים לא מומצאים.
          </p>
        </section>

        <LandingDemo />
      </main>
    </>
  );
}
