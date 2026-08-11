# DEPLOYMENT_GUIDE.md — Personal vs Enterprise

> Choose ONE path before handing any prompt to Claude. Everything downstream depends on it.

---

## Path A — Personal Portfolio (RECOMMENDED for your career)

**Goal:** a live, public demo you own, on free infrastructure, with shadcn/ui design
system, that you can show in FDE/GenAI interviews.

| Component | Service | Free tier limit | Impact on the product |
|---|---|---|---|
| Web app | Vercel (Hobby) | 100 GB bandwidth, 100 deployments/day, 60s function timeout | Fine for demo traffic; 60s cap means we split the audit into Inngest steps (each page is its own 30–50s step) |
| Design system | shadcn/ui + Tailwind CSS v4 | Free (MIT) | Professional-looking UI from day one — cards, tables, tabs, badges, accordions, toasts |
| Database | Supabase | 500 MB DB, 2 projects, 50K MAU | Findings are small rows — 500 MB is thousands of audits |
| Background jobs | Inngest | 5 concurrent exec, 10 functions, event history auto-expires | Each page-scan is a separate Inngest step — stays under Vercel's per-function limit |
| Browser | @sparticuz/chromium | Free (OSS, auto-downloads on Vercel) | Works on Vercel's serverless runtime; cold-start adds ~3–5s per scan page — acceptable for demo |
| File storage | Supabase Storage | Free 1 GB | Evidence screenshots/crops — rotate old evidence after 30 days |
| Live Explore sessions | Local dev only (`npx next dev`) | Vercel can't hold open Chrome sessions | Explore workbench runs on your laptop in dev mode; batch auditor is the public Vercel demo |
| Domain | `<you>.vercel.app` or custom domain | Free | Public URL you share in your portfolio |

**What to tell Claude:**
> "Deploy on Vercel (Hobby) + Supabase (free) + Inngest (free). Design system: shadcn/ui
> with Tailwind CSS v4. Use @sparticuz/chromium for headless browsing on Vercel.
> Execute `P0_BUILD_PROMPT.md` — it already targets this exact stack."

**IP ownership:** YOURS. Your Vercel account, your Supabase project, your Inngest
workspace. Coforge can see the demo; they cannot claim ownership.

---

## Path B — Coforge Enterprise (Azure VM)

**Goal:** full enterprise deployment on Coforge's Azure Windows Server VM, for
potential internal use or client delivery. IP: Coforge owns it. You get appraisal.

| Component | Service | Spec |
|---|---|---|
| Web app + worker | Node.js on Windows Server, PM2 | Persistent process, no function limit |
| Database | PostgreSQL 16 (Windows service) | Local, zero external SaaS |
| Queue | pg-boss (Postgres-backed) | No Redis, no external service |
| Browser | Playwright Chromium (bundled) | Persistent pool, 2 concurrent |
| File storage | Local disk (126 GB) | Store evidence, rotate with scheduled task |
| Authentication | None in P0; Entra ID SSO in P6 | Azure-native |
| Backup | pg_dump scheduled task | Daily to local + optional Azure Blob |

**Prompt:** `P0_BUILD_PROMPT.md` already targets this deployment exactly — it
assumes local Postgres, pg-boss, Windows Server, and the specified concurrency cap.
No adaptation needed.

---

## Path C — Hybrid (build personal, license enterprise later)

- Build P0–P4 on Path A (Personal). You own the IP. Demo it publicly.
- Keep enterprise features (SSO, multi-tenant, on-prem, CI/CD integrations) in the
  codebase but gated behind an enterprise license.
- If Coforge (or another consultancy) wants it, offer a **license** + services deal.
  "I built this tool. You can license it for your clients, with enterprise features
  that run on your Azure VM. I'll maintain it and build custom modules."

This is the standard SaaS founder path — and it starts with Path A.

---

## Recommendation

Path A on your personal accounts. Claude builds it exactly the way you built the old
DesignVelocity app (Vercel + Supabase) — the architecture is proven, the accuracy is
fixed by the settle sequence, and the tool is yours. Path B exists on paper if Coforge
asks for it. Path C is the long game.
