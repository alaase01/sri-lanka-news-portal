import type { NextConfig } from "next";
import { baseSecurityHeaders, publicCoop, publicCsp } from "./src/config/security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Development only: lets a phone or another computer on the same Wi-Fi or office
  // network open the dev server (http://192.168.x.x:3000). Without this, Next.js
  // blocks the page's scripts for any address other than localhost, so buttons
  // such as the mobile menu do nothing. Has no effect on the production build.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "172.17.*.*", "172.18.*.*", "172.19.*.*", "172.20.*.*", "172.21.*.*", "172.22.*.*", "172.23.*.*", "172.24.*.*", "172.25.*.*", "172.26.*.*", "172.27.*.*", "172.28.*.*", "172.29.*.*", "172.30.*.*", "172.31.*.*", "*.local",
    // Tunnels for testing on a phone from anywhere (ngrok).
    "*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.dev", "*.ngrok.io"],
  experimental: {
    // Image uploads go through a server action. Kept below the proxy's 10 MB body limit.
    serverActions: { bodySizeLimit: "9mb" },
  },
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
      {
        source: "/((?!admin).*)",
        headers: [
          { key: "Content-Security-Policy", value: publicCsp },
          // Public pages: the Facebook/X/Telegram share window must be able to report back
          // to the page that opened it, or Facebook's dialog never finishes. Admin keeps same-origin.
          { key: "Cross-Origin-Opener-Policy", value: publicCoop },
        ],
      },
    ];
  },
};

export default nextConfig;
