import type { Metadata } from "next";

import { Topbar } from "@/components/topbar";

export const metadata: Metadata = {
  title: "תור הנציג | יועץ הרכב של שטראוס",
  robots: { index: false, follow: false },
};

// Placeholder until the rep queue lands.
export default function RepHome() {
  return (
    <>
      <Topbar step={null} />
      <main className="mx-auto flex w-full max-w-screen-md flex-1 flex-col justify-center gap-4 px-5 py-16">
        <h1 className="font-display text-4xl">תור הנציג</h1>
        <p className="text-muted-foreground">המסך הזה עדיין בבנייה.</p>
      </main>
    </>
  );
}
