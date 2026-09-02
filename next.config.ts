import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheMaxMemorySize: 64 * 1024 * 1024,
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ui-avatars.com" },
      { protocol: "https", hostname: "*.amazonaws.com" },
      { protocol: "https", hostname: "*.cloudinary.com" },
    ],
  },
  experimental: {
    preloadEntriesOnStart: false,
    optimizePackageImports: ["lucide-react", "date-fns", "@hello-pangea/dnd"],
  },
};

export default nextConfig;
