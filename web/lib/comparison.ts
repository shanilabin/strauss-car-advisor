import type { components } from "@/lib/api/schema";

type Comparison = components["schemas"]["Comparison"];

/**
 * The alternative to open first: the engine's best one when it is in this comparison, else the first.
 * best_option_id is measured against every eligible alternative, so it may be one that wasn't compared.
 */
export function defaultOptionId(comparison: Comparison | null | undefined): string | null {
  const results = comparison?.results ?? [];
  const best = results.find((r) => r.option.id === comparison?.best_option_id);
  return best?.option.id ?? results[0]?.option.id ?? null;
}
