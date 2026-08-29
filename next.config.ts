import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Browsing the dev server from another device (a phone on the same Wi-Fi)
  // means the requests arrive from a different origin than the one the server
  // was started on. Next.js blocks cross-origin requests to its dev-only
  // endpoints (`/_next/*`, `/__nextjs*`) with a 403 unless the origin is
  // allow-listed here, which breaks HMR, the dev overlay and RSC prefetches on
  // the phone. These patterns cover the usual private LAN ranges and mDNS
  // hostnames; only `next dev` reads this.
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
    "*.local",
  ],

  experimental: {
    // Every request to a dynamic route (`/canvas/[roomId]`,
    // `/projects/[projectId]/optimiser`) makes the dev server fork a throwaway
    // Node child process to resolve static params — even though both pages are
    // `force-dynamic`. That child re-loads the whole route module graph, and if
    // it dies the browser gets "Jest worker encountered 2 child process
    // exceptions, exceeding retry limit" instead of the page. Running it as a
    // worker thread keeps it inside the dev server, so there is no separate
    // process to run out of memory or fail to spawn. Dev only — builds keep
    // using child processes.
    workerThreads: isDev,
  },
};

export default nextConfig;
