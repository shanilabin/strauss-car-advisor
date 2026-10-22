import type { Metadata } from "next";
import Image from "next/image";

import { EmployeeLogin } from "@/components/employee-login";
import { Topbar } from "@/components/topbar";

export const metadata: Metadata = {
  title: "כניסה | Strauss Drive",
};

export default function LoginPage() {
  return (
    <>
      <Topbar step={null} active="" />
      <main className="mx-auto flex w-full min-w-0 max-w-4xl flex-1 flex-col justify-center overflow-x-clip px-4 py-10 sm:px-6 sm:py-16">
        <div className="grid overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-lift md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="relative isolate hidden flex-col justify-center gap-8 overflow-hidden p-8 md:flex">
            <Image
              src="/brand/bg-flowing-ribbons.webp"
              alt=""
              fill
              sizes="(min-width: 768px) 40vw, 0px"
              className="-z-10 object-cover object-[60%_40%] dark:opacity-40"
            />
            <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-surface/80 via-surface/20 to-transparent" />
            <p className="font-display text-2xl leading-snug text-primary">
              כמה יישאר לך בנטו
              <br />
              עם כל רכב?
            </p>
            <Image
              src="/brand/mascot-hero.webp"
              alt=""
              width={898}
              height={900}
              className="mascot-float mx-auto h-auto w-48 drop-shadow-[0_14px_16px_rgb(23_50_72/0.2)]"
            />
          </div>
          <div className="flex flex-col gap-7 p-6 sm:p-10">
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-4xl">כניסה ל-Strauss Drive</h1>
              <p className="text-muted-foreground">
                יועץ הרכב לעובדי שטראוס. מתחברים פעם אחת, והשיחות שלך נשמרות לפעם הבאה.
              </p>
            </div>
            <EmployeeLogin />
          </div>
        </div>
      </main>
    </>
  );
}
