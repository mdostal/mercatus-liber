import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Printful art uploads (lib/printful-actions.ts) go through a server action; 1MB is the default.
    // Kept under Vercel's 4.5MB request limit.
    serverActions: { bodySizeLimit: "4mb" },
  },
  // Workspace packages are consumed from their built dist/ output (see each
  // package's package.json "main" field) -- no special transpilePackages
  // config needed.
};

export default nextConfig;
