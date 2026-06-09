import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin tracing root to this project so a stray package-lock.json
  // somewhere up the tree doesn't make Next misidentify the workspace.
  outputFileTracingRoot: path.resolve(__dirname),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;
