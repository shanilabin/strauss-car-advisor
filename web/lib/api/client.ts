import createClient from "openapi-fetch";

import { getSupabase } from "@/lib/supabase/client";

import type { paths } from "./schema";

/** Browser API client. baseUrl is same-origin; Next rewrites /api/* to the backend. */
export const api = createClient<paths>({ baseUrl: "/api" });

api.use({
  async onRequest({ request }) {
    const {
      data: { session },
    } = await getSupabase("employee").auth.getSession();
    const token = session?.access_token;
    if (!token) return request;

    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return new Request(request, { headers });
  },
});
