import createClient from "openapi-fetch";

import { getSupabase, type AuthArea } from "@/lib/supabase/client";

import type { paths } from "./schema";

function createApiClient(area: AuthArea) {
  const client = createClient<paths>({ baseUrl: "/api" });

  client.use({
    async onRequest({ request }) {
      const {
        data: { session },
      } = await getSupabase(area).auth.getSession();
      const token = session?.access_token;
      if (!token) return request;

      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${token}`);
      return new Request(request, { headers });
    },
  });

  return client;
}

/** Browser API client for the employee area (anonymous JWT). */
export const api = createApiClient("employee");

/** Browser API client for the rep area (rep JWT from the separate storage key). */
export const repApi = createApiClient("rep");
