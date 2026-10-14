import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";

/** Hebrew text for an auth failure; anything without a specific message gets `fallback`. */
export function authErrorMessage(error: unknown, fallback: string): string {
  if (isAuthRetryableFetchError(error)) return "אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.";
  if (isAuthApiError(error) && error.status === 429) return "היו יותר מדי ניסיונות. חכו כמה דקות ונסו שוב.";
  return fallback;
}
