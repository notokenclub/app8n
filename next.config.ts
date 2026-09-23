import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon; bundling it breaks the .node binding.
  serverExternalPackages: ["better-sqlite3"],
  // Standalone output is what makes the Docker image small enough to be worth
  // shipping: the server and only the dependencies it actually imports.
  output: "standalone",
};

export default nextConfig;
