import { ArrowLeft, Play, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { HowItWorks, LandingFaq, ValueCards } from "@/components/landing-sections";
import { Topbar } from "@/components/topbar";
import { buttonVariants } from "@/components/ui/button";

const enterAt = (index: number) => ({ "--enter-index": index }) as CSSProperties;

export default function Home() {
  return (
    <>
      <Topbar step={null} active="/" />
      <main className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <section aria-labelledby="landing-title" className="relative isolate overflow-hidden">
          {/* Color in Motion: the brand arcs frame the hero; the text side stays calm. */}
          <Image
            src="/brand/bg-corner-arcs.webp"
            alt=""
            fill
            preload
            sizes="100vw"
            className="-z-10 object-cover object-top opacity-95 dark:opacity-25"
          />
          <div className="mx-auto grid w-full max-w-screen-xl items-center gap-6 px-4 pt-8 pb-10 sm:px-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10 lg:px-10 lg:pt-14 lg:pb-16">
            <div className="min-w-0">
              <h1
                id="landing-title"
                className="enter font-display text-[2.6rem] leading-[1.05] break-words text-navy sm:text-6xl lg:text-[4.25rem] xl:text-[5rem]"
                style={enterAt(0)}
              >
                בוחרים רכב.
                <br />
                <span className="bg-gradient-to-l from-brand-blue to-brand-cyan bg-clip-text text-transparent dark:from-[#63cae9] dark:to-[#9bdaee]">
                  רואים את ההבדל.
                </span>
              </h1>
              <p
                className="enter mt-6 max-w-xl text-lg leading-relaxed text-foreground/85 lg:text-xl"
                style={enterAt(1)}
              >
                השוואה חכמה, פשוטה ובטוחה של כל אפשרויות הרכב שלך,
                <br className="max-sm:hidden" /> עם הבנה מלאה של ההשפעה על הנטו.
              </p>
              <div className="enter mt-9 flex flex-wrap items-center gap-3" style={enterAt(2)}>
                <Link
                  href="/c/new"
                  className={buttonVariants({ size: "lg", variant: "action", className: "ps-8" })}
                >
                  מתחילים עכשיו
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-white text-action">
                    <ArrowLeft aria-hidden className="size-5" />
                  </span>
                </Link>
                <Link href="/form" className={buttonVariants({ size: "lg", variant: "outline" })}>
                  <span className="inline-flex size-8 items-center justify-center rounded-full border-2 border-current">
                    <Play aria-hidden className="size-3.5 fill-current" />
                  </span>
                  נסו עם עובד לדוגמה
                </Link>
              </div>
              <p
                className="enter mt-7 flex max-w-xl items-center gap-2 text-sm text-muted-foreground"
                style={enterAt(3)}
              >
                <ShieldCheck aria-hidden className="size-4 shrink-0 text-success" />
                החישוב לפי כללי החברה ונתוני רשות המסים. המספרים לא מומצאים.
              </p>
            </div>

            <div className="enter relative mx-auto w-full max-w-[17rem] min-w-0 sm:max-w-[24rem] lg:max-w-[34rem]" style={enterAt(1)}>
              <Image
                src="/brand/mascot-hero.webp"
                alt="הקמע של Strauss Drive: מכונית לבנה וצבעונית עם שבשבת שטראוס"
                width={898}
                height={900}
                preload
                sizes="(min-width: 1024px) 34rem, 80vw"
                className="mascot-float relative h-auto w-full drop-shadow-[0_24px_30px_rgb(23_50_72/0.18)]"
              />
            </div>
          </div>
        </section>

        <ValueCards />
        <HowItWorks />
        <LandingFaq />
      </main>
    </>
  );
}
