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
    // pdfjs-dist itself needs tracing for the same reason: even with no
    // rendering, it resolves pdf.worker.mjs by path at parse time (the Node
    // "fake worker" path), plus cmaps/standard fonts for some encodings —
    // all loaded dynamically, so none of it is statically reachable.
    "/api/**": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/**",
      "./node_modules/@napi-rs/**",
      "./node_modules/pdfjs-dist/**",
    ],
  },
  async headers() {
    // Belt-and-suspenders cache guard for the whole API surface. Route
    // Handlers here are already dynamic-by-default (none opt into
    // `dynamic = "force-static"`, `revalidate`, or a cached `fetch`), so
    // Next's own Data Cache never stores these responses. But several routes
    // return audit-specific or otherwise sensitive data (findings, evidence
    // URLs, report HTML/PDF, Figma tokens) without ever setting an explicit
    // Cache-Control header of their own — leaving them dependent on that
    // implicit default rather than an explicit contract. That matters most
    // for the anonymous/IP-owner-scoped routes (report, pdf, sr-preview,
    // contrast-finding): those requests carry no Authorization header, so
    // the RFC 7234 rule barring shared caches from storing
    // Authorization-bearing responses doesn't protect them — a permissive
    // shared/corporate proxy sitting in front could still cache a 200 with
    // no cache directives at all and later replay it to a different caller
    // who requests the identical URL, bypassing the per-request IP-ownership
    // check entirely since the proxy never reaches origin on a hit.
    //
    // Setting this centrally, at the routing layer, guarantees every
    // response path (success AND error) on every /api/** route carries an
    // explicit no-store — not just the ones a route author remembered to
    // annotate — without touching dozens of individual `Response.json(...)`
    // call sites. Routes that already set their own Cache-Control (the
    // preview-proxy family) are unaffected: same directive, no conflict.
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
