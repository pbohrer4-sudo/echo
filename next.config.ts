import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack to this project so a stray package-lock.json elsewhere
  // doesn't cause it to misidentify the workspace root.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
