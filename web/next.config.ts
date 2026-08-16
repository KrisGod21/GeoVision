import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // The repo root also has a package.json (for the asset pipeline), which
    // Next would otherwise infer as the workspace root.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
