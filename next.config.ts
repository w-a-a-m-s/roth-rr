import type { NextConfig } from "next";

// Stable in dev so a config reload does not throw away the compile cache.
const BUILD_ID =
  process.env.BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA || "dev";

const nextConfig: NextConfig = {
  generateBuildId: () => BUILD_ID,
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "",
    // Never add a server-only key (MONGODB_*, EXTERNAL_DATA_*) here. Keys in
    // `env` are compiled into every bundle as string literals, so process.env
    // reads stop being runtime lookups.
  },
  async redirects() {
    return [
      {
        // Auth.js default error URL. The branded page lives at /auth/error.
        source: "/api/auth/error",
        destination: "/auth/error",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
