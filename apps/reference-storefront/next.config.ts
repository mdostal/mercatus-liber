import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are consumed from their built dist/ output (see each
  // package's package.json "main" field) -- no special transpilePackages
  // config needed.
};

export default nextConfig;
