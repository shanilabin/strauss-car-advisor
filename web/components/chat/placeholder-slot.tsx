import { cn } from "@/lib/utils";

/** Clearly empty slot for a component that lands in a later task — no fake data. */
export function PlaceholderSlot({
  label,
  hint,
  className,
}: {
  label: string;
  hint: string;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "flex min-h-48 flex-col items-start justify-center gap-2 border border-dashed border-border bg-surface-raised/40 px-5 py-8",
        className,
      )}
    >
      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </section>
  );
}
