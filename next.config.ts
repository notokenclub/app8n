import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon; bundling it breaks the .node binding.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
