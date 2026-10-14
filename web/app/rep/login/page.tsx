import type { Metadata } from "next";

import { RepLoginForm } from "@/components/rep-login-form";
import { Topbar } from "@/components/topbar";

export const metadata: Metadata = {
  title: "כניסת נציג | יועץ הרכב של שטראוס",
  robots: { index: false, follow: false },
};

export default function RepLogin() {
  return (
    <>
      <Topbar step={null} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-16">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl">כניסת נציג</h1>
          <p className="text-muted-foreground">מסך לנציגי התחבורה בלבד.</p>
        </div>
        <RepLoginForm />
      </main>
    </>
  );
}
