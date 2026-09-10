import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";

/**
 * Cache review finding: none of the audit-specific JSON/PDF/CSV routes under
 * /api/** (report, pdf, sr-preview, vpat/export, enterprise/keys, the audits
 * list/detail, etc.) set an explicit Cache-Control header. They currently
 * rely entirely on Next.js's "Route Handlers are not cached by default"
 * behavior for THIS response layer — which holds today (no route sets
 * `dynamic = "force-static"`, `revalidate`, or a cached `fetch`) — but that's
 * an implicit property of how each route happens to be written, not an
 * explicit contract. It gives no defense-in-depth against:
 *  - a future edit accidentally introducing static/ISR opt-in on one of
 *    these routes without anyone noticing the response is now cacheable,
 *  - a non-RFC-7234-compliant intermediary (a permissive corporate/shared
 *    proxy) applying heuristic caching to a 200 response that carries no
 *    cache directives at all — a real concern specifically for the
 *    anonymous/IP-owner-scoped routes (report, pdf, sr-preview,
 *    contrast-finding), since those requests carry no Authorization header,
 *    so the RFC 7234 "shared caches MUST NOT store Authorization-bearing
 *    responses" rule doesn't protect them the way it does for signed-in
 *    (Bearer-token) requests.
 *
 * Fix: a single next.config.ts headers() rule stamping every /api/** route
 * with `Cache-Control: private, no-store`, applied at the routing layer so
 * it covers every response path (success AND error) in one place, rather
 * than touching dozens of individual `Response.json(...)` call sites.
 *
 * This test fails against the pre-fix next.config.ts (no headers() export
 * at all) and passes once the rule is added.
 */
describe("next.config headers() — /api/** responses are never cacheable by default", () => {
  it("declares a headers() function", () => {
    expect(typeof nextConfig.headers).toBe("function");
  });

  it("stamps every /api/** route with Cache-Control: private, no-store", async () => {
    const rules = await nextConfig.headers!();
    const apiRule = rules.find((r) => r.source === "/api/:path*");
    expect(apiRule, "expected a headers() rule matching /api/:path*").toBeTruthy();

    const cacheControl = apiRule!.headers.find(
      (h) => h.key.toLowerCase() === "cache-control"
    );
    expect(cacheControl, "expected a Cache-Control header on the /api/:path* rule").toBeTruthy();

    // Must contain both directives — "no-store" alone already prevents
    // storage, "private" additionally documents that even a compliant
    // shared/CDN cache must not reuse this response across callers.
    expect(cacheControl!.value).toContain("no-store");
    expect(cacheControl!.value).toContain("private");
  });
});
