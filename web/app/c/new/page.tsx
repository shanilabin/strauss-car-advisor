import Link from "next/link";

import { Topbar } from "@/components/topbar";

// Placeholder until the conversation screen lands; the step indicator is wired to its status later.
export default function NewConversation() {
  return (
    <>
      <Topbar step={1} />
      <main className="mx-auto flex w-full max-w-screen-md flex-1 flex-col justify-center gap-4 px-5 py-16">
        <h1 className="font-display text-4xl">השיחה תתחיל כאן</h1>
        <p className="text-muted-foreground">המסך הזה עדיין בבנייה.</p>
        <Link href="/" className="inline-flex h-11 w-fit items-center font-semibold text-link underline-offset-4 hover:underline">
          חזרה לדף הבית
        </Link>
      </main>
    </>
  );
}
