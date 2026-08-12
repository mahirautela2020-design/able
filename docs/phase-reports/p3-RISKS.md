# P3 RISKS — Figma + Image Auditing

| # | Risk | Mitigation |
|---|---|---|
| 1 | **BLOCKER-IF-ABSENT:** Figma PAT not in `.env`. Without it the Figma audit route cannot hit the live API. | Treat Figma as optional-feature: route returns "Figma disabled: add FIGMA_PAT" when env missing; parse + client unit tests use recorded fixtures so verify gate passes WITHOUT a live PAT. Orchestrator stops only if builder insists on live calls. |
| 2 | Real Figma file JSON is large (MBs) and nested ~10 levels; parsing resp could blow parse fn complexity. | parse.ts must be recursive + stack-safe; fixture is a trimmed redacted slice; client caps `depth` query param at 4. |
| 3 | Figma rate limits (7500 req/day/token, 100/min). A user pasting a huge fileKey could DoS. | Rate-limit route via Inngest queue (reuse settle-before-scan funnel); cache.getFile(nodeId) keyed by fileKey+nodeId hash in Supabase `figma_cache` table (added in SETUP/P6 migration — stub for now). |
| 4 | Image fills with gradients or remote png URLs cannot be contrast-measured reliably. WCAG only covers solid pairs. | Skip + emit INFO finding `{ kind: 'contrast', note: 'gradient/image fill skipped' }`. Do NOT fabricate ratios. |
| 5 | Figma "characters" node may lack style block (rame unstyled); divide by zero in ratio calc. | Guard: missing style → treat as 16px regular; surface INFO "inferred size". Never throw on partial data. |
| 6 | axe-core is a DOM auditor — it cannot directly inspect Figma JSON. Misusing it would weaken the evidence-first guardrail. | Image-contrast is a NEW deterministic rule module (`lib/audit/image-contrast.ts`), NOT axe-core. Findings carry `source: 'rule-contrast'`. axe-core stays pinned and only runs on rendered HTML (P1 paths unchanged). |
| 7 | SSRF risk: if node URL or image URL is user-controlled, attacker could pivot `api/audit/figma` to hit internal hosts. | Hard-pin `api.figma.com`/HTTPS in client.ts; image URLs fetched server-side only via a allowlist (`figma-alpha-api.s3`, `figma.com`). Reject everything else with 400. Covered in `client.test.ts`. |
| 8 | Personal keys in fixtures: sample-file.json might leak a user's Figma content/PAT. | Redact any `lastModifiedBy`, email, ownerId fields before committing; keep fixture in `__fixtures__/`; never commit `.env`. |
| 9 | sharp is ~25MB native binary; Vercel Hobby function size limit. | Pin sharp to a prebuilt binary variant (`sharp@^0.33`); only load lazily inside route, not at module top. If install fails on Windows, skip image-raster path and only support vector fills. |
| 10 | Large-text threshold (3:1) misapplied to Figma frames which don't carry a "text size" concept clearly (style may be inherited). | Walk style chain explicitly; if no font size in node or ancestors, default to "normal" (4.5:1 threshold). Emit INFO with rationale. |
| 11 | P6 auth may not exist yet; route left wide-open leaks PAT-protected Figma data to anonymous callers. | Gate route behind `process.env.FIGMA_AUDIT_PUBLIC !== 'true'` → default 401; when P6 lands, swap to RBAC. Add a test asserting 401 when flag unset. |
| 12 | Spec contradiction: BLUEPRINT §2 lists "image contrast"; ENTERPRISE_SPEC §10 describes Figma integration separately. Could double-build. | Treat as ONE module per spec (Figma + image rules together); route path `/api/audit/figma`. Note in PR description. |

Hard stop conditions: if Figma API schema mismatches fixture (parse fn can't handle keys),
fix fixture first, NOT parse — spec is the source of truth.