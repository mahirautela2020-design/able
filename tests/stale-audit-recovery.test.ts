import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * In-memory fake mimicking the slice of the supabase-js query builder used
 * by failStaleRunningAudits/updateAuditStatus: chainable .select/.eq/.lt
 * and .update/.eq, both awaitable via .then.
 */
function makeFakeSupabaseClient(initialRows: Array<Record<string, unknown>>) {
  const rows = initialRows;
  const updateCalls: Array<{ payload: Record<string, unknown>; matchedIds: string[] }> = [];

  function chain(mode: "select" | "update", payload?: Record<string, unknown>) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const api = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return api;
      },
      lt(col: string, val: unknown) {
        filters.push((r) => (r[col] as string) < (val as string));
        return api;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === "update") {
          matched.forEach((r) => Object.assign(r, payload));
          updateCalls.push({ payload: payload!, matchedIds: matched.map((r) => r.id as string) });
          return Promise.resolve({ error: null }).then(resolve, reject);
        }
        return Promise.resolve({
          data: matched.map((r) => ({ id: r.id })),
          error: null,
        }).then(resolve, reject);
      },
    };
    return api;
  }

  return {
    client: {
      from(_table: string) {
        return {
          select(_cols: string) {
            return chain("select");
          },
          update(payload: Record<string, unknown>) {
            return chain("update", payload);
          },
        };
      },
    },
    updateCalls,
    rows,
  };
}

describe("failStaleRunningAudits", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  it("marks a running audit stuck well past the max duration as failed with STALE_EXECUTION", async () => {
    const staleCreatedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    const { client, updateCalls } = makeFakeSupabaseClient([
      { id: "stale-1", status: "running", created_at: staleCreatedAt },
    ]);

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => client,
    }));

    const { failStaleRunningAudits } = await import("@/lib/supabase/server");
    const ids = await failStaleRunningAudits({ maxMinutes: 10 });

    expect(ids).toEqual(["stale-1"]);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].matchedIds).toEqual(["stale-1"]);
    expect(updateCalls[0].payload.status).toBe("failed");
    expect(updateCalls[0].payload.error_code).toBe("STALE_EXECUTION");
    expect(typeof updateCalls[0].payload.error_detail).toBe("string");
  });

  it("does not touch a running audit that started recently", async () => {
    const freshCreatedAt = new Date(Date.now() - 2 * 60_000).toISOString();
    const { client, updateCalls } = makeFakeSupabaseClient([
      { id: "fresh-1", status: "running", created_at: freshCreatedAt },
    ]);

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => client,
    }));

    const { failStaleRunningAudits } = await import("@/lib/supabase/server");
    const ids = await failStaleRunningAudits({ maxMinutes: 10 });

    expect(ids).toEqual([]);
    expect(updateCalls).toHaveLength(0);
  });

  it("does not touch an audit that already completed", async () => {
    const staleCreatedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    const { client, updateCalls } = makeFakeSupabaseClient([
      { id: "done-1", status: "complete", created_at: staleCreatedAt },
    ]);

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => client,
    }));

    const { failStaleRunningAudits } = await import("@/lib/supabase/server");
    const ids = await failStaleRunningAudits({ maxMinutes: 10 });

    expect(ids).toEqual([]);
    expect(updateCalls).toHaveLength(0);
  });

  it("scopes the check to a single audit id when auditId is passed", async () => {
    const staleCreatedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    const { client, updateCalls } = makeFakeSupabaseClient([
      { id: "stale-a", status: "running", created_at: staleCreatedAt },
      { id: "stale-b", status: "running", created_at: staleCreatedAt },
    ]);

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => client,
    }));

    const { failStaleRunningAudits } = await import("@/lib/supabase/server");
    const ids = await failStaleRunningAudits({ maxMinutes: 10, auditId: "stale-a" });

    expect(ids).toEqual(["stale-a"]);
    expect(updateCalls).toHaveLength(1);
  });
});
