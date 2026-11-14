import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones/tablets on the LAN load the dev server (dev-only setting).
  allowedDevOrigins: ["192.168.1.5", "192.168.1.*"],
  // Offline service worker (z_offline): always re-checked, so a deploy updates it.
  async headers() {
    return [{ source: '/sw.js', headers: [
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
    ] }]
  },
};

export default nextConfig;
