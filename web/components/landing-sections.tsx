import { BarChart3, ChevronDown, Coins, Heart, ShieldCheck, TrendingUp, Zap } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

import { formatDelta, formatShekel } from "@/lib/format";
import { LANDING_DEMO_SAMPLE as sample } from "@/lib/landing-demo-sample";
import { cn } from "@/lib/utils";

const VALUES = [
  {
    title: "חוסכים כסף",
    text: "רואים את כל העלויות באמת ומבינים את ההשפעה על הנטו.",
    icon: Heart,
    tone: "bg-peach",
    badge: "bg-brand-red text-white",
  },
  {
    title: "השוואה ברורה",
    text: "משווים בין דגמים, מסלולים ותנאים, בקלות ובשקיפות מלאה.",
    icon: BarChart3,
    tone: "bg-mist",
    badge: "bg-brand-blue text-white",
  },
  {
    title: "מהיר ופשוט",
    text: "כל המידע במקום אחד, בלי בירוקרטיה מיותרת.",
    icon: Zap,
    tone: "bg-mint",
    badge: "bg-brand-green text-white",
  },
] as const;

/** The three value-proposition cards under the hero. */
export function ValueCards() {
  return (
    <section aria-label="למה זה טוב לך" className="relative z-10 -mt-4 px-4 sm:px-6 lg:-mt-10 lg:px-10">
      <ul className="mx-auto grid max-w-screen-xl gap-4 md:grid-cols-3 lg:gap-6">
        {VALUES.map(({ title, text, icon: Icon, tone, badge }) => (
          <li
            key={title}
            className={cn(
              "flex items-center gap-5 rounded-3xl border border-white/80 p-6 shadow-card dark:border-border lg:p-7",
              tone,
            )}
          >
            <span className={cn("inline-flex size-16 shrink-0 items-center justify-center rounded-full shadow-soft", badge)}>
              <Icon aria-hidden className="size-7" strokeWidth={2.4} />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-extrabold">{title}</span>
              <span className="mt-1 block leading-snug text-foreground/80">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "כך זה נראה בפעולה": three small previews of the real screens. */
export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-24 px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      <div className="mx-auto max-w-screen-xl rounded-[2rem] bg-mist/70 p-5 sm:p-8 lg:p-10 dark:bg-surface">
        <h2 id="how-title" className="text-2xl font-extrabold lg:text-3xl">
          כך זה נראה בפעולה
        </h2>
        <p className="mt-1 text-foreground/75">כל מה שצריך כדי לקבל החלטה חכמה, במקום אחד.</p>

        <ol className="mt-8 grid gap-5 md:grid-cols-3 lg:gap-6">
          <Preview title="מספרים ליועץ על עצמכם" text="בשיחה קצרה בעברית חופשית. היועץ שואל רק מה שחסר.">
            <ChatPreview />
          </Preview>
          <Preview title="מבינים את ההשפעה על הנטו" text="רואים בדיוק כמה ישתנה הנטו, ולמה.">
            <ImpactPreview />
          </Preview>
          <Preview title="משווים בין כל החלופות" text="כל הרכבים בקטלוג וגם ויתור על הרכב, מסודרים לפי הנטו.">
            <OptionsPreview />
          </Preview>
        </ol>
      </div>
    </section>
  );
}

function Preview({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <li className="flex flex-col rounded-3xl bg-surface p-4 shadow-card">
      <div aria-hidden className="flex h-44 items-stretch overflow-hidden rounded-2xl bg-background p-4">
        {children}
      </div>
      <h3 className="mt-4 px-2 text-lg font-extrabold">{title}</h3>
      <p className="px-2 pb-2 text-sm text-foreground/75">{text}</p>
    </li>
  );
}

function ChatPreview() {
  return (
    <div className="flex w-full flex-col justify-center gap-2.5">
      <div className="flex items-end gap-2">
        <Image src="/brand/mascot-avatar.webp" alt="" width={40} height={40} className="size-9 rounded-full bg-surface p-0.5" />
        <span className="rounded-2xl rounded-ee-md bg-mist px-3 py-2 text-xs font-medium">איזה רכב יש לך היום?</span>
      </div>
      <div className="flex justify-end">
        <span className="rounded-2xl rounded-es-md bg-mint px-3 py-2 text-xs font-medium">קורולה קרוס 2025</span>
      </div>
      <div className="flex items-end gap-2">
        <Image src="/brand/mascot-avatar.webp" alt="" width={40} height={40} className="size-9 rounded-full bg-surface p-0.5" />
        <span className="rounded-2xl rounded-ee-md bg-mist px-3 py-2 text-xs font-medium">מעולה! מצאתי אותו במאגר.</span>
      </div>
    </div>
  );
}

function ImpactPreview() {
  return (
    // The net goes UP, so the "בחלופה" bar is clearly the taller one, solid to its top, with the gain on it
    // (QA UX10: a top that faded to white read as a shorter bar).
    <div className="grid w-full grid-cols-2 items-end gap-6 px-4">
      <div className="flex flex-col items-center gap-1">
        <span className="h-12 w-full rounded-t-lg bg-gradient-to-t from-brand-blue to-brand-sky" />
        <span className="text-[0.7rem] font-semibold text-foreground/75">היום</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="inline-flex flex-col items-center rounded-xl bg-success px-3 py-1 text-white shadow-soft dark:text-[#102632]">
          <bdi dir="ltr" className="text-base font-extrabold">{formatDelta(sample.delta)}</bdi>
          <span className="text-[0.65rem] font-semibold">בחודש · דוגמה</span>
        </span>
        <span className="h-20 w-full rounded-t-lg bg-gradient-to-t from-brand-green to-brand-green/75" />
        <span className="text-[0.7rem] font-semibold text-foreground/75">בחלופה</span>
      </div>
    </div>
  );
}

function OptionsPreview() {
  // In the engine's order for the same sample employee: for her net, giving up the car comes first
  const rows = [
    { name: "ויתור על הרכב", drive: "אחזקה", tone: "bg-peach", best: true },
    { name: "MG4", drive: "חשמלי", tone: "bg-mist", best: false },
    { name: sample.vehicleName, drive: sample.driveLabel, tone: "bg-mint", best: false },
  ];
  return (
    <ul className="flex w-full flex-col justify-center gap-2">
      {rows.map((row) => (
        <li key={row.name} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 shadow-soft">
          <span className={cn("inline-flex size-7 items-center justify-center rounded-lg", row.tone)}>
            <TrendingUp className="size-3.5 text-success" />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-bold">
            <bdi>{row.name}</bdi>
            <span className="ms-1 font-normal text-muted-foreground">{row.drive}</span>
          </span>
          {row.best && (
            <span className="rounded-full bg-success px-2 py-0.5 text-[0.6rem] font-bold text-white dark:text-[#102632]">
              מומלץ
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const FAQ = [
  {
    q: "מאיפה מגיעים המספרים?",
    a: "כל מספר מחושב בקוד, לפי כללי החברה (תקציבים, מסלולים, ויתור) ולפי מאגר שווי השימוש של רשות המסים. היועץ רק משוחח ומסביר. הוא לא מחשב ולא ממציא.",
    icon: ShieldCheck,
  },
  {
    q: "מה אם חסר לי פרט, למשל ההשתתפות ברכב חדש?",
    a: "היועץ לא מנחש. פרט שרק החברה יודעת נשאל את נציג התחבורה, וההשוואה מתעדכנת אצלך ברגע שהוא עונה.",
    icon: Coins,
  },
  {
    q: "למה רכב חשמלי מעלה את הנטו?",
    a: "שווי השימוש של רכב חשמלי נמוך יותר, ולכן המס יורד. בנוסף, החברה נותנת החזר חשמל חודשי, מגולם כך שהוא מגיע במלואו לנטו. בהשוואה רואים בדיוק מה כל רכיב תורם.",
    icon: Zap,
  },
  {
    q: "אפשר לוותר על הרכב?",
    a: "בחלק מהתפקידים כן, ומקבלים אחזקת רכב לפי טבלת העיסוקים. בתפקידים שבהם הרכב הוא חובה, היועץ יסביר למה אי אפשר.",
    icon: Heart,
  },
] as const;

export function LandingFaq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24 px-4 pb-16 sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-screen-xl gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-start">
        <div className="flex items-center gap-4 lg:flex-col lg:items-start">
          <Image src="/brand/mascot-guide.webp" alt="" width={514} height={520} className="h-auto w-28 lg:w-56" />
          <div>
            <h2 id="faq-title" className="text-2xl font-extrabold lg:text-3xl">
              שאלות נפוצות
            </h2>
            <p className="mt-1 text-foreground/75">כל מה שכדאי לדעת לפני שמתחילים.</p>
          </div>
        </div>
        <ul className="flex flex-col gap-3">
          {FAQ.map(({ q, a, icon: Icon }) => (
            <li key={q}>
              <details className="group rounded-2xl border border-border bg-surface shadow-soft open:shadow-card">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 font-bold [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-mist text-primary">
                    <Icon aria-hidden className="size-4.5" />
                  </span>
                  <span className="flex-1">{q}</span>
                  <ChevronDown aria-hidden className="size-5 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-5 ps-17 leading-relaxed text-foreground/85">{a}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only">
        דוגמת ההשפעה מבוססת על העובדת לדוגמה {sample.employeeName}: נטו היום{" "}
        {formatShekel(sample.netToday)}, נטו בחלופה {formatShekel(sample.netOption)}.
      </p>
    </section>
  );
}
