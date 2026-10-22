import { todayArrangementLabel } from "@/components/comparison-card";
import type { components } from "@/lib/api/schema";
import { formatDelta, formatShekel } from "@/lib/format";

type Comparison = components["schemas"]["Comparison"];
type OptionResult = components["schemas"]["OptionResult"];

/**
 * A one-page summary of the comparison on screen, for "save as PDF". Hidden on screen; when printing it is
 * the only thing on the page (globals.css, .print-summary). Every number is the engine's, from the DTO -
 * the browser prints Hebrew and RTL natively, so no PDF library and no fonts to embed.
 */
export function PrintSummary({ comparison, result }: { comparison: Comparison; result: OptionResult }) {
  const profile = comparison.profile_snapshot;
  const estimated = !result.complete || result.participation_status === "DEFAULT_PENDING";
  const { context } = comparison;

  return (
    <section aria-hidden className="print-summary hidden" dir="rtl">
      <header className="flex items-end justify-between border-b-2 border-black pb-3">
        <div>
          <p className="text-3xl font-black">Strauss Drive</p>
          <p className="text-sm">סיכום השוואת רכב{profile.first_name ? ` · ${profile.first_name}` : ""}</p>
        </div>
        <p className="text-sm">הופק ב-{new Date().toLocaleDateString("he-IL")}</p>
      </header>

      <h1 className="mt-5 text-2xl font-extrabold">
        {result.option.label} <span className="font-normal">מול</span> {todayArrangementLabel(profile)}
      </h1>
      <p className="mt-1 text-sm">{result.eligibility.reason}</p>

      {result.delta != null ? (
        <>
          <table className="mt-5 w-full border-collapse text-base">
            <tbody>
              <Row label="נטו היום" value={formatShekel(result.net_today ?? 0)} />
              <Row label="נטו בחלופה" value={formatShekel(result.net_option ?? 0)} />
              <Row label={estimated ? "הפרש נטו חודשי (משוער)" : "הפרש נטו חודשי"} value={formatDelta(result.delta)} strong />
              {(result.delta_over_years ?? []).map((p) => (
                <Row key={p.years} label={p.years === 1 ? "בשנה" : `ב-${p.years} שנים`} value={formatDelta(p.amount)} />
              ))}
            </tbody>
          </table>

          {result.waterfall && result.waterfall.length > 0 && (
            <>
              <h2 className="mt-6 text-lg font-bold">מה משנה את הנטו</h2>
              <table className="mt-2 w-full border-collapse text-sm">
                <tbody>
                  {result.waterfall.map((step) => (
                    <Row key={step.key} label={step.label} value={formatDelta(step.delta)} />
                  ))}
                </tbody>
              </table>
            </>
          )}

          {result.explanation && result.explanation.length > 0 && (
            <div className="mt-6 text-sm leading-relaxed">
              {result.explanation.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}

          {result.break_even_participation != null && result.delta !== 0 && (
            <p className="mt-4 text-sm">
              <span className="font-bold">מתי זה משתנה? </span>
              {result.delta > 0
                ? `החלופה משתלמת כל עוד ההשתתפות בה היא עד ${formatShekel(result.break_even_participation)} בחודש.`
                : `החלופה תשתלם רק אם ההשתתפות בה תרד מתחת ל-${formatShekel(result.break_even_participation)} בחודש.`}
            </p>
          )}
        </>
      ) : (
        <p className="mt-5">אין עדיין תוצאה מספרית לחלופה הזו.</p>
      )}

      <footer className="mt-8 border-t border-black pt-3 text-xs leading-relaxed">
        {estimated && <p>ההשתתפות היא הערכה לפי הקטלוג, עד אישור נציג התחבורה.</p>}
        <p>
          כל המספרים חושבו במנוע החישוב של Strauss Drive: טבלאות שכר {context.payroll_tax_year}, שווי שימוש{" "}
          {context.value_of_use_tax_year} (רשות המסים), כללים בגרסה {context.config_version}.
        </p>
        <p>המסמך להמחשה בלבד ואינו מחליף תלוש שכר.</p>
      </footer>
    </section>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className="border-b border-neutral-300">
      <th scope="row" className={strong ? "py-2 text-start font-extrabold" : "py-2 text-start font-normal"}>
        {label}
      </th>
      <td className={strong ? "py-2 text-end text-xl font-black" : "py-2 text-end font-semibold"}>
        <bdi dir="ltr">{value}</bdi>
      </td>
    </tr>
  );
}
