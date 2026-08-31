import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheMaxMemorySize: 16 * 1024 * 1024,
  productionBrowserSourceMaps: false,
  experimental: {
    preloadEntriesOnStart: false,
  },
};

export default nextConfig;
