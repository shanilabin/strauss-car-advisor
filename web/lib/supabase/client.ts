import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The employee and the rep keep their sessions under separate storage keys, so a rep
 * login and an employee's anonymous session can live side by side in one browser.
 */
export type AuthArea = "employee" | "rep";

const clients: Partial<Record<AuthArea, SupabaseClient>> = {};

/** Browser-only singleton per area, created on first use so prerendering never needs the keys. */
export function getSupabase(area: AuthArea): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("getSupabase() is browser-only; call it from an effect or an event handler.");
  }

  const existing = clients[area];
  if (existing) return existing;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY - copy web/.env.example to web/.env.local.",
    );
  }

  const client = createClient(url, key, { auth: { storageKey: `strauss-${area}-auth` } });
  clients[area] = client;
  return client;
}
