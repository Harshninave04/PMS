import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `output: "standalone"` is only for Docker (see Dockerfile which copies
  // `.next/standalone`). Vercel uses its own adapter and expects the default
  // output with `.next/next-server.js.nft.json` traces — standalone breaks
  // `vercel build` with ENOENT on that file.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  experimental: {
    // Lets the dashboard layout answer a real 403 (`forbidden()` + a
    // `forbidden.tsx` boundary) for a page the caller's role may not open,
    // instead of quietly rendering a shell the user cannot use.
    authInterrupts: true,
  },
};

export default nextConfig;
