<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Able (ScanA11y) — Contributor Notes

See `README.md` for setup, architecture, and feature overview.

## Standing rules

- Guardrails: the vision/LLM layer never creates hard findings (advisory only,
  routed to a `needs_review` bucket), axe-core runs pinned and local,
  Supabase RLS is deny-all by default, outbound fetches are SSRF-guarded.
- OSS stack only — no paid APIs in the audit pipeline.
- Browser tests: set `CHROME_EXECUTABLE_PATH` to your local Chrome binary.
- Run only one dev server at a time (default port 3000); check for stale
  processes before starting a new one.
