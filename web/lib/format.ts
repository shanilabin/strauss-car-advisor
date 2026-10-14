const shekels = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });

/** "11,032 ₪". Render inside <bdi dir="ltr"> so the sign and symbol stay in place in RTL. */
export function formatShekels(amount: number): string {
  return `${shekels.format(amount)} ₪`;
}

/** "+661 ₪" / "−661 ₪" (true minus sign) / "0 ₪". */
export function formatSignedShekels(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${formatShekels(Math.abs(amount))}`;
}
