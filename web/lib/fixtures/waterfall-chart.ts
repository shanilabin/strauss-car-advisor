/**
 * Dev-only fixture: OptionResult with a full waterfall[] (Noa Levi vs ATTO 3).
 * Shaped like components["schemas"]["OptionResult"]. Numbers match the engine DTO.
 * Do not import from production routes.
 */
import type { components } from "@/lib/api/schema";

import { noaLeviAttoResult } from "@/lib/fixtures/noa-levi-comparison";

type OptionResult = components["schemas"]["OptionResult"];
type WaterfallStep = components["schemas"]["WaterfallStep"];

/** Complete OptionResult whose waterfall steps sum to delta (+661). */
export const waterfallChartFixture: OptionResult = noaLeviAttoResult;

/** The waterfall steps alone, for chart-unit experiments. */
export const waterfallStepsFixture: WaterfallStep[] = noaLeviAttoResult.waterfall ?? [];
