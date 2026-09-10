import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * In-memory fake mimicking the slice of the supabase-js query builder used
 * by getRecentAudits: chainable .select/.eq/.is/.order/.limit, awaitable via
 * .then. Real AND semantics on chained filters — the whole point of this
 * test is proving the anonymous branch no longer matches an owned row just
 * because its created_ip happens to match.
 */
function makeFakeSupabaseClient(rows: Array<Record<string, unknown>>) {
  function chain() {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const api = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return api;
      },
      is(col: string, val: null) {
        filters.push((r) => r[col] === val);
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
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

const ROWS = [
  { id: "owned-by-a", target_url: "https://a-internal.example.com", created_by: "user-a", created_ip: "9.9.9.9" },
  { id: "anon-same-ip", target_url: "https://public-site.example.com", created_by: null, created_ip: "9.9.9.9" },
  { id: "owned-by-b-diff-ip", target_url: "https://b.example.com", created_by: "user-b", created_ip: "1.1.1.1" },
];

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

describe("getRecentAudits — anonymous IP scope must not leak owned audits", () => {
  it("an anonymous caller on the same IP as a signed-in user's audit sees ONLY the anonymous row", async () => {
    const { client } = makeFakeSupabaseClient(ROWS);
    vi.doMock("@supabase/supabase-js", () => ({ createClient: () => client }));

    const { getRecentAudits } = await import("@/lib/supabase/server");
    const result = await getRecentAudits(10, { userId: null, ip: "9.9.9.9" });

    const ids = (result ?? []).map((r) => (r as { id: string }).id);
    expect(ids).toEqual(["anon-same-ip"]);
    expect(ids).not.toContain("owned-by-a");
  });

  it("a signed-in caller sees only their own audits, never IP-matched", async () => {
    const { client } = makeFakeSupabaseClient(ROWS);
    vi.doMock("@supabase/supabase-js", () => ({ createClient: () => client }));

    const { getRecentAudits } = await import("@/lib/supabase/server");
    const result = await getRecentAudits(10, { userId: "user-a", ip: "9.9.9.9" });

    const ids = (result ?? []).map((r) => (r as { id: string }).id);
    expect(ids).toEqual(["owned-by-a"]);
  });
});
