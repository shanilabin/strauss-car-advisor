import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Topbar } from "@/components/topbar";

export const metadata: Metadata = {
  title: "מדיניות פרטיות | Strauss Drive",
  description: "איזה מידע Strauss Drive שומר, למה, ומי רואה אותו",
};

const UPDATED = "22 באוקטובר 2026";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-2xl text-primary">{title}</h2>
      <div className="flex flex-col gap-2 leading-relaxed">{children}</div>
    </section>
  );
}

/** The privacy policy: what is kept, why, who sees it. Also the link Google's sign-in screen shows. */
export default function PrivacyPage() {
  return (
    <>
      <Topbar step={null} active="" />
      <main className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-4xl">מדיניות פרטיות</h1>
          <p className="text-muted-foreground">עודכן ב-{UPDATED}</p>
          <p className="leading-relaxed">
            Strauss Drive הוא יועץ רכב לעובדי שטראוס: הוא מראה לעובד כמה יישאר לו בנטו עם כל חלופת רכב. הוא נבנה
            במסגרת האקתון, ובשלב הזה הוא מערכת הדגמה. כאן מוסבר איזה מידע נשמר, למה, ומי רואה אותו.
          </p>
        </header>

        <Section title="איזה מידע אנחנו אוספים">
          <ul className="list-disc ps-5">
            <li>
              <strong>פרטי חשבון:</strong> כתובת האימייל, ובכניסה עם Google גם השם. מ-Google אנחנו מבקשים רק שם,
              אימייל ותמונת פרופיל, ולא ניגשים לשום דבר אחר בחשבון.
            </li>
            <li>
              <strong>פרטי השיחה:</strong> מה שמוסר ליועץ כדי לחשב את הנטו: שכר, עיסוק, נקודות זיכוי, הרכב הנוכחי
              והחלופות שנבחרו, וההודעות בשיחה עצמה.
            </li>
            <li>
              <strong>תלוש שכר, אם מעלים:</strong> הקובץ נקרא כדי למלא את הפרטים, ולא נשמר. נשמרים רק הפרטים שהעובד
              אישר על המסך.
            </li>
          </ul>
        </Section>

        <Section title="למה">
          <p>
            כדי לחשב השוואה מדויקת, לפנות אליך בשמך, ולשמור את השיחות כך שאפשר לחזור ולהמשיך מאיפה שעצרת. אנחנו
            לא משתמשים במידע לפרסום, לא מוכרים אותו ולא משתפים אותו עם אף אחד מעבר למפורט כאן.
          </p>
        </Section>

        <Section title="מי רואה את המידע">
          <ul className="list-disc ps-5">
            <li>
              <strong>את/ה:</strong> כל עובד רואה רק את השיחות שלו. ההפרדה נאכפת במסד הנתונים עצמו.
            </li>
            <li>
              <strong>נציג/ת התחבורה:</strong> רק כשהעובד מבקש להתקדם עם רכב, או כשחסר פרט שרק הנציג יודע, הנציג
              רואה את השאלה ואת פרטי השיחה הנדרשים כדי לענות.
            </li>
            <li>
              <strong>ספקי שירות:</strong> הנתונים נשמרים ב-Supabase, והאתר רץ ב-Vercel. ההודעות בשיחה נשלחות
              למודל שפה (Google Gemini, Groq או OpenRouter) כדי לנסח תשובה. המספרים עצמם מחושבים במנוע החישוב
              שלנו ולא במודל.
            </li>
          </ul>
        </Section>

        <Section title="מערכת הדגמה: בלי נתונים אמיתיים">
          <p>
            בגרסה הזו המודלים רצים בשכבה החינמית של הספקים, שעשויים להשתמש בתוכן לשיפור השירות שלהם. לכן{" "}
            <strong>אין להזין שכר אמיתי או תלוש אמיתי</strong>. אפשר להשתמש בעובדים לדוגמה שבמצב הטופס.
          </p>
        </Section>

        <Section title="שמירה ומחיקה">
          <p>
            השיחות נשמרות כל עוד המערכת פעילה. אפשר לבקש למחוק את החשבון ואת כל השיחות שלו, ונמחק אותם. בגרסה
            מבצעית תוגדר מחיקה אוטומטית של שיחות ישנות.
          </p>
        </Section>

        <Section title="יצירת קשר">
          <p>
            לשאלות על פרטיות או לבקשת מחיקה של החשבון והשיחות, פנו לנציג/ת התחבורה בחברה.
          </p>
        </Section>

        <p>
          <Link href="/" className="font-semibold text-link underline underline-offset-4">
            חזרה לדף הבית
          </Link>
        </p>
      </main>
    </>
  );
}
