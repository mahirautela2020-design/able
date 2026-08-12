# P1 — Explore Workbench v1: Risks & Mitigations

1. **Cross-origin iframe blocks pickering.** Most real sites block iframing
   (X-Frame-Options/CSP); even when framed, cross-origin denies DOM access so
   the element picker can't read AX/computed styles. **Mitigation:** P1 demos
   Explore against the same-origin `tests/fixtures/explore-demo.html` fixture;
   for cross-origin targets the picker is disabled with an honest "open in new
   tab" message. Real remote-session (Playwright+CDP mirror) is a later
   increment — note in PR, do NOT sink a week into it now.

2. **Browser-side axe-core bundle size.** axe-core 4.13 is ~140 KB. Loading
   it in the explore bundle bloats the workbench. **Mitigation:** dynamic
   `import("@axe-core/...")` inside the explore path only; never in the
   results-view path.

3. **Colorjs.io CVD matrices accuracy.** Simulation matrices are an
   approximation; not a medical-grade CVD model. **Mitigation:** label the
   overlay "simulated — verify with real users"; never make a pass/fail WCAG
   claim from CVD alone — only flag pairs for human review.

4. **Focus-ring overlay z-index / iframe events.** Drawing numbered rings over
   an iframe can be eaten by the iframe's own pointer events or clipped. Keep the overlay pointer-events-none except the picker layer, and draw rings as
   sibling absolutely-positioned divs sized from the bbox reported by the
   fixture bridge. **Mitigation:** fixture reports bbox in iframe-local coords;
   converter maps to overlay coords; test asserts ring count, not pixels.

5. **AX-snapshot route SSRF.** `app/api/explore/ax-snapshot/route.ts` takes a
   URL → spins Playwright. **Mitigation:** call `lib/ssrf.ts` `validateHost`
   before launch; reject private/metadata IPs; cap page lifetime;*e2e asserts
   `http://169.254.169.254` returns 403.*

6. **Playwright in the API route on Vercel.** Vercel Hobby functions may
   reject Chromium launch (size/timeout). **Mitigation:** gate the snapshot
   route behind `RUNTIME=nodejs`, set generous `maxDuration`; if launch fails,
   return 502 with a clear message. Local dev (the demo path) works fully.

7. **Two dev servers on port 3000.** **Mitigation:** `npm run verify`
   pre-check kills stale PID (`taskkill /PID <pid> /F`); browser tests run
   against `next start`, never `next dev`.

8. **Next.js 16 breaking changes.** Route handlers / server actions shape may
   differ from training. **Mitigation:** read
   `node_modules/next/dist/docs/` before writing any route; heed AGENTS.md
   note.

9. **Builder invents findings / WCAG claims.** Temptation to stub fake
   issues. **Mitigation:** all WCAG pass/fail shown in Explore must come from
   real axe-core / real contrast math, never hardcoded; reviewer rejects
   invented WCAG verdicts.

10. **Scope creep.** Builder tempted into flow recorder / session import /
    modules. **Mitigation:** TASKS §2 P1 scope only; reject out-of-phase code.

11. **BLOCKER-IF-ABSENT:** `CHROME_EXECUTABLE_PATH` for e2e. Verify: verifier.sh
    exports it; document in PR if gate fails. P1 needs NO new credentials
    (no Figma/Supabase keys — fixture is local). Flag immediately if any task
    surfaces a credential requirement.