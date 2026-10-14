import { FlaskConical, Zap } from "lucide-react";
import type { CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import { formatShekels, formatSignedShekels } from "@/lib/format";
import { LANDING_DEMO_SAMPLE as sample } from "@/lib/landing-demo-sample";

const enterAt = (index: number) => ({ "--enter-index": index }) as CSSProperties;

/** Static illustration of a result card, built only from the labelled sample constant. */
export function LandingDemo() {
  return (
    <div className="relative">
      <div aria-hidden className="enter absolute -end-3 -top-3 size-16 bg-lime" style={enterAt(5)} />
      <figure
        aria-label="המחשה של תוצאה, על בסיס נתוני הדגמה"
        className="enter relative border border-border bg-surface"
        style={enterAt(3)}
      >
        <figcaption className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <span className="font-semibold">{sample.employeeName}</span>
          <Badge variant="highlight">
            <FlaskConical aria-hidden data-icon="inline-start" />
            נתוני הדגמה
          </Badge>
        </figcaption>

        <div className="bg-cobalt px-5 py-6 text-white lg:px-8 lg:py-8">
          <p className="text-sm font-semibold">השינוי בנטו החודשי</p>
          <p className="mt-1 text-5xl leading-tight font-black sm:text-6xl">
            <bdi dir="ltr">{formatSignedShekels(sample.delta)}</bdi>
          </p>
          <p className="mt-1 font-medium">יותר בנטו בכל חודש</p>
        </div>

        <dl className="grid grid-cols-2">
          <div className="border-e border-border px-5 py-4">
            <dt className="text-xs text-muted-foreground">נטו היום</dt>
            <dd className="mt-1 text-xl font-extrabold lg:text-2xl">
              <bdi dir="ltr">{formatShekels(sample.netToday)}</bdi>
            </dd>
          </div>
          <div className="px-5 py-4">
            <dt className="text-xs text-muted-foreground">נטו בחלופה</dt>
            <dd className="mt-1 text-xl font-extrabold lg:text-2xl">
              <bdi dir="ltr">{formatShekels(sample.netOption)}</bdi>
            </dd>
          </div>
        </dl>

        <div className="enter flex items-center gap-3 border-t border-border px-5 py-4" style={enterAt(4)}>
          <span className="inline-flex size-10 items-center justify-center border border-border bg-surface-raised">
            <Zap aria-hidden className="size-5" />
          </span>
          <span className="flex flex-col">
            <bdi className="font-semibold">{sample.vehicleName}</bdi>
            <span className="text-xs text-muted-foreground">{sample.driveLabel}</span>
          </span>
        </div>
      </figure>
    </div>
  );
}
