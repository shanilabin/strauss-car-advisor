import type { NextConfig } from "next";

// The FastAPI backend. Locally: uvicorn on :8000. On Vercel: the strauss-api project URL (set API_URL).
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser only ever talks to /api/* on our own origin - no CORS, one URL.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
