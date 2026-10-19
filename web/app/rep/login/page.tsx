import type { Metadata } from "next";
import Image from "next/image";

import { RepLoginForm } from "@/components/rep-login-form";
import { Topbar } from "@/components/topbar";

export const metadata: Metadata = {
  title: "כניסת נציג | יועץ הרכב של שטראוס",
  robots: { index: false, follow: false },
};

export default function RepLogin() {
  return (
    <>
      <Topbar step={null} area="rep" />
      <main className="mx-auto flex w-full min-w-0 max-w-4xl flex-1 flex-col justify-center overflow-x-clip px-4 py-10 sm:px-6 sm:py-16">
        <div className="grid overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-lift md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="relative isolate hidden flex-col justify-end overflow-hidden p-8 md:flex">
            <Image
              src="/brand/bg-pinwheel-waves.webp"
              alt=""
              fill
              sizes="(min-width: 768px) 40vw, 0px"
              className="-z-10 object-cover object-[30%_50%] dark:opacity-40"
            />
            <Image
              src="/brand/mascot-peek.webp"
              alt=""
              width={355}
              height={360}
              className="mascot-float mx-auto h-auto w-44 drop-shadow-[0_14px_16px_rgb(23_50_72/0.2)]"
            />
          </div>
          <div className="flex flex-col gap-8 p-6 sm:p-10">
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-4xl">כניסת נציג</h1>
              <p className="text-muted-foreground">מסך לנציגי התחבורה בלבד.</p>
            </div>
            <RepLoginForm />
          </div>
        </div>
      </main>
    </>
  );
}
