import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: {
    // Vercel's Turbopack tracing drops non-JS assets from external packages.
    // playwright-core needs browsers.json + .js bundles at runtime, and
    // @sparticuz/chromium needs its bundled chromium binary — without these
    // the serverless function crashes at module load ("Cannot find module
    // .../playwright-core/browsers.json").
    "/api/**": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/**",
    ],
  },
};

export default nextConfig;
