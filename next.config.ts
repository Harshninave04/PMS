import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Lets the dashboard layout answer a real 403 (`forbidden()` + a
    // `forbidden.tsx` boundary) for a page the caller's role may not open,
    // instead of quietly rendering a shell the user cannot use.
    authInterrupts: true,
  },
};

export default nextConfig;
