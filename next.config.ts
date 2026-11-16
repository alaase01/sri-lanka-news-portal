import type { NextConfig } from "next";
import { baseSecurityHeaders, publicCsp } from "./src/config/security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // Sinhala is the default edition.
    return [{ source: "/", destination: "/si", permanent: true }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      // Admin pages get a stricter, per-request policy from src/proxy.ts instead.
      { source: "/((?!admin).*)", headers: [{ key: "Content-Security-Policy", value: publicCsp }] },
    ];
  },
};

export default nextConfig;
