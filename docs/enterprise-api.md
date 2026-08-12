# Able Enterprise API

P6 enterprise shell — auth, RBAC, API keys, MCP wrapper, audit logging, RLS.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/enterprise/keys` | Bearer token (owner) | List API keys for org |
| POST | `/api/enterprise/keys` | Bearer token (owner) | Issue new API key |
| DELETE | `/api/enterprise/keys` | Bearer token (owner) | Revoke API key |

## Authentication

- **User auth:** Bearer token from Supabase session (validated via service role)
- **API key auth:** `X-API-Key` header (hashed, org-scoped)
- **RLS:** org-scoped policies on audits, findings, audit_pages; deny-all default

## RBAC

| Role | Audits | Reports | Evidence | Settings | Members | API Keys | Org |
|------|--------|---------|----------|----------|---------|----------|-----|
| Owner | R/W | R/W | R/W | R/W | Manage | Manage | Manage |
| Admin | R/W | R/W | R/W | R/W | Manage | — | Read |
| Auditor | R/W | R/W | R/W | Read | — | — | Read |
| Viewer | Read | Read | Read | Read | — | — | Read |

## MCP Wrapper

`src/lib/mcp/wrapper.ts` exposes `startAudit`, `getFindings`, `exportReport`.
Read-only facade over existing LLM-free pipelines. No finding creation, no LLM
invocation. External MCP clients use API key auth + the wrapper.

## Rate Limiting

In-memory token bucket (60 req/min per key). Falls back to per-instance on
Vercel serverless. Prod path: Upstash Redis or Supabase-backed limiter.

## Schema

Run `supabase/migrations/0001_enterprise_rls.sql` to create:
- `org_memberships` — user/org/role/status
- `api_keys` — hashed keys with expiry/revocation
- `audit_log` — append-only enterprise audit trail
- RLS policies on audits, findings, audit_pages (org-scoped)
