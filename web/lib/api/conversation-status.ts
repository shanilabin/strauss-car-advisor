import type { Step } from "@/components/topbar";

import type { components } from "./schema";

export type ConversationStatus = components["schemas"]["ConversationStatus"];

/** Layout phase derived from ConversationState.status — never invent a phase. */
export type LayoutPhase = "collecting" | "options" | "comparison";

/** Topbar steps: COLLECTING → 1, READY → 2, PRESENTED / WAITING_REP → 3. */
export function stepFromStatus(status: ConversationStatus): Step {
  switch (status) {
    case "COLLECTING":
      return 1;
    case "READY":
      return 2;
    case "PRESENTED":
    case "WAITING_REP":
      return 3;
  }
}

export function layoutPhaseFromStatus(status: ConversationStatus): LayoutPhase {
  switch (status) {
    case "COLLECTING":
      return "collecting";
    case "READY":
      return "options";
    case "PRESENTED":
    case "WAITING_REP":
      return "comparison";
  }
}
