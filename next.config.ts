import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "@sparticuz/chromium", "playwright-core", "pdfjs-dist"],
  outputFileTracingIncludes: {
    // Vercel's Turbopack tracing drops non-JS assets from external packages.
    // playwright-core needs browsers.json + .js bundles at runtime, and
    // @sparticuz/chromium needs its bundled chromium binary — without these
    // the serverless function crashes at module load ("Cannot find module
    // .../playwright-core/browsers.json").
    //
    // pdfjs-dist is the same story with an extra twist: it reaches for
    // @napi-rs/canvas at load time via createRequire — invisible to static
    // tracing — and that package is the ONLY source it polyfills DOMMatrix
    // and Path2D from in Node. Without it, module evaluation reaches a
    // top-level `new DOMMatrix()` and the function dies with "DOMMatrix is
    // not defined" even though every local run works (Node dev installs the
    // platform binary, so the polyfill quietly succeeds there).
    "/api/**": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/**",
      "./node_modules/@napi-rs/**",
    ],
  },
};

export default nextConfig;
