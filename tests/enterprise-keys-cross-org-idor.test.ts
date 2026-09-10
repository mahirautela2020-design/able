import { describe, it, expect, vi, beforeEach } from "vitest";

// DELETE /api/enterprise/keys (src/app/api/enterprise/keys/route.ts) reads
// `keyId` from the request body and used to call `revokeApiKey(keyId)`
// (src/lib/enterprise/apikeys.ts) with a mutation scoped ONLY by the key's
// own id, never by `org_id` -- the route knew the caller's org
// (`auth.session.orgId`) and used it for the audit-log entry, but never for
// the actual revoke query. Any org admin (anyone with "apikey:manage" in
// their OWN org) could revoke a DIFFERENT organization's API key just by
// supplying its id -- a cross-org IDOR, denial-of-service against a
// stranger's org. `listApiKeys` (same file) already filtered by org_id;
// revokeApiKey was the one call site that didn't. Fixed by chaining
// .eq("id", id).eq("org_id", orgId).select("id") and reporting whether any
// row actually matched.
const { requireEnterpriseAuth } = vi.hoisted(() => ({
  requireEnterpriseAuth: vi.fn(async () => ({
    session: {
      userId: "admin-org-a",
      orgId: "org-a",
      role: "owner",
      membershipStatus: "active",
    },
  })),
}));
vi.mock("@/lib/enterprise/auth", () => ({ requireEnterpriseAuth }));

vi.mock("@/lib/enterprise/ratelimit", () => ({
  recordAuditLog: vi.fn(async () => {}),
}));

// A tiny in-memory api_keys table so the fake client can tell a same-org
// revoke apart from a cross-org one by actually applying the chained
// filters, not just recording that .eq() was called.
const TABLE = [
  { id: "key-owned-by-org-a", org_id: "org-a", revoked_at: null },
  { id: "key-owned-by-org-b", org_id: "org-b", revoked_at: null },
];

const fromMock = vi.hoisted(() =>
  vi.fn((_table: string) => {
    const rows = () => TABLE; // captured by closure below
    return {
      update(fields: Record<string, unknown>) {
        const filters: Array<(r: (typeof TABLE)[number]) => boolean> = [];
        const api = {
          eq(col: string, val: unknown) {
            filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val);
            return api;
          },
          select(_cols: string) {
            const matched = rows().filter((r) => filters.every((f) => f(r)));
            matched.forEach((r) => Object.assign(r, fields));
            return Promise.resolve({
              data: matched.map((r) => ({ id: r.id })),
              error: null,
            });
          },
        };
        return api;
      },
    };
  })
);
vi.mock("@/lib/supabase/server", () => ({ supabase: { from: fromMock } }));

import { DELETE } from "@/app/api/enterprise/keys/route";

beforeEach(() => {
  fromMock.mockClear();
  TABLE[0].revoked_at = null;
  TABLE[1].revoked_at = null;
});

function req(keyId: string): Request {
  return new Request("http://localhost/api/enterprise/keys", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keyId }),
  });
}

describe("DELETE /api/enterprise/keys -- cross-org isolation", () => {
  it("must NOT revoke a key belonging to a different org", async () => {
    const res = await DELETE(req("key-owned-by-org-b"));

    expect(res.status).toBe(404);
    expect(TABLE[1].revoked_at).toBeNull();
  });

  it("revokes a key that actually belongs to the caller's own org", async () => {
    const res = await DELETE(req("key-owned-by-org-a"));

    expect(res.status).toBe(200);
    expect(TABLE[0].revoked_at).not.toBeNull();
  });
});
