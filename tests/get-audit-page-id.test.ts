import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * In-memory fake mimicking the slice of the supabase-js query builder used
 * by getAuditPageId: chainable .select/.eq/.order, awaitable via .then.
 * .order() actually sorts (ascending, nullsFirst configurable) so the
 * "deterministic fallback" behavior can be asserted, not just called.
 */
function makeFakeSupabaseClient(rows: Array<Record<string, unknown>>) {
  function chain() {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const orders: Array<{ col: string; ascending: boolean; nullsFirst?: boolean }> = [];
    const api = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return api;
      },
      order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
        orders.push({ col, ascending: opts?.ascending ?? true, nullsFirst: opts?.nullsFirst });
        return api;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        let matched = rows.filter((r) => filters.every((f) => f(r)));
        for (const o of [...orders].reverse()) {
          matched = [...matched].sort((a, b) => {
            const av = a[o.col];
            const bv = b[o.col];
            if (av == null && bv == null) return 0;
            if (av == null) return o.nullsFirst ? -1 : 1;
            if (bv == null) return o.nullsFirst ? 1 : -1;
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return o.ascending ? cmp : -cmp;
          });
        }
        return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
      },
    };
    return api;
  }

  return {
    client: {
      from(_table: string) {
        return { select(_cols: string) { return chain(); } };
      },
    },
  };
}

describe("getAuditPageId", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  it("matches exactly when the page URL is byte-identical", async () => {
    const { client } = makeFakeSupabaseClient([
      { id: "page-1", audit_id: "audit-1", page_url: "https://example.com/about", scanned_at: "2026-01-01T00:00:00Z" },
      { id: "page-2", audit_id: "audit-1", page_url: "https://example.com/contact", scanned_at: "2026-01-01T00:00:01Z" },
    ]);
    vi.doMock("@supabase/supabase-js", () => ({ createClient: () => client }));

    const { getAuditPageId } = await import("@/lib/supabase/server");
    const id = await getAuditPageId("audit-1", "https://example.com/contact");
    expect(id).toBe("page-2");
  });

  it("regression: matches across an http->https redirect", async () => {
    const { client } = makeFakeSupabaseClient([
      { id: "page-1", audit_id: "audit-1", page_url: "https://example.com/about", scanned_at: "2026-01-01T00:00:00Z" },
    ]);
    vi.doMock("@supabase/supabase-js", () => ({ createClient: () => client }));

    const { getAuditPageId } = await import("@/lib/supabase/server");
    const id = await getAuditPageId("audit-1", "http://example.com/about");
    expect(id).toBe("page-1");
  });

  it("regression: matches across a www redirect", async () => {
    const { client } = makeFakeSupabaseClient([
      { id: "page-1", audit_id: "audit-1", page_url: "https://www.example.com/about", scanned_at: "2026-01-01T00:00:00Z" },
    ]);
    vi.doMock("@supabase/supabase-js", () => ({ createClient: () => client }));

    const { getAuditPageId } = await import("@/lib/supabase/server");
    const id = await getAuditPageId("audit-1", "https://example.com/about");
    expect(id).toBe("page-1");
  });

  it("regression: fallback (no pageUrl match) is deterministic — earliest-scanned page, not arbitrary DB order", async () => {
    const { client } = makeFakeSupabaseClient([
      { id: "page-2", audit_id: "audit-1", page_url: "https://example.com/second", scanned_at: "2026-01-01T00:00:05Z" },
      { id: "page-1", audit_id: "audit-1", page_url: "https://example.com/first", scanned_at: "2026-01-01T00:00:01Z" },
    ]);
    vi.doMock("@supabase/supabase-js", () => ({ createClient: () => client }));

    const { getAuditPageId } = await import("@/lib/supabase/server");
    const id = await getAuditPageId("audit-1", "https://unrelated.example/nowhere");
    expect(id).toBe("page-1");
  });

  it("returns null when the audit has no pages", async () => {
    const { client } = makeFakeSupabaseClient([]);
    vi.doMock("@supabase/supabase-js", () => ({ createClient: () => client }));

    const { getAuditPageId } = await import("@/lib/supabase/server");
    const id = await getAuditPageId("audit-1");
    expect(id).toBeNull();
  });
});
