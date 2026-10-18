import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Let phones/tablets on the LAN load the dev server (dev-only setting).
  allowedDevOrigins: ["192.168.1.5", "192.168.1.*"],

  experimental: {
    // Every request to a dynamic route (`/canvas/[roomId]`,
    // `/projects/[projectId]/optimiser`) makes the dev server fork a throwaway
    // Node child process to resolve static params. If it dies the browser gets
    // "Jest worker encountered 2 child process exceptions, exceeding retry
    // limit" instead of the page. Running it as a worker thread keeps it inside
    // the dev server. Dev only — builds keep using child processes.
    workerThreads: isDev,
  },
};

export default nextConfig;
