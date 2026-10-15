const shekel = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("he-IL", {
  style: "percent",
  maximumFractionDigits: 2,
});

/** "₪11,032". Render inside <bdi dir="ltr"> so the symbol stays in place in RTL. */
export function formatShekel(amount: number): string {
  return shekel.format(amount);
}

/**
 * "6.5%" — `value` is in percent points as on engine DTOs (e.g. pension_pct: 6.5),
 * not a 0–1 fraction.
 */
export function formatPercent(value: number): string {
  return percent.format(value / 100);
}

/** "+661 ₪" / "-661 ₪" / "0 ₪" — explicit sign; values come from engine DTOs only. */
export function formatDelta(amount: number): string {
  const abs = shekel.format(Math.abs(amount));
  if (amount > 0) return `+${abs}`;
  if (amount < 0) return `-${abs}`;
  return abs;
}
