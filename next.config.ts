import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones/tablets on the LAN load the dev server (dev-only setting).
  allowedDevOrigins: ["192.168.1.5", "192.168.1.*"],
};

export default nextConfig;
