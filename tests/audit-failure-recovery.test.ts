import { describe, it, expect, vi, beforeEach } from "vitest";

describe("GET /api/audits/[id] stale-audit recovery", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("checks for staleness scoped to this audit before returning it", async () => {
    const failStaleRunningAudits = vi.fn(async () => []);
    const getAudit = vi.fn(async () => ({
      id: "audit-1",
      status: "failed",
      error_code: "STALE_EXECUTION",
      error_detail: "No progress for over 10 minutes",
    }));
    const getFindingsForAudit = vi.fn(async () => []);

    vi.doMock("@/lib/supabase/server", () => ({
      getAudit,
      getFindingsForAudit,
      failStaleRunningAudits,
    }));

    const { GET } = await import("@/app/api/audits/[id]/route");
    const res = await GET(new Request("http://localhost/api/audits/audit-1"), {
      params: Promise.resolve({ id: "audit-1" }),
    });

    expect(failStaleRunningAudits).toHaveBeenCalledWith({ auditId: "audit-1" });
    // The staleness check must run before the row is fetched, so a
    // just-marked-stale audit is reflected in the same response.
    const staleCallOrder = failStaleRunningAudits.mock.invocationCallOrder[0];
    const getAuditCallOrder = getAudit.mock.invocationCallOrder[0];
    expect(staleCallOrder).toBeLessThan(getAuditCallOrder);

    const body = await res.json();
    expect(body.status).toBe("failed");
    expect(body.error_code).toBe("STALE_EXECUTION");
  });

  it("still returns the audit even if the staleness check itself throws", async () => {
    const failStaleRunningAudits = vi.fn(async () => {
      throw new Error("db unavailable");
    });
    const getAudit = vi.fn(async () => ({ id: "audit-1", status: "running" }));
    const getFindingsForAudit = vi.fn(async () => []);

    vi.doMock("@/lib/supabase/server", () => ({
      getAudit,
      getFindingsForAudit,
      failStaleRunningAudits,
    }));

    const { GET } = await import("@/app/api/audits/[id]/route");
    const res = await GET(new Request("http://localhost/api/audits/audit-1"), {
      params: Promise.resolve({ id: "audit-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("running");
  });
});

describe("auditUrl onFailure handler", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("marks the audit failed with SCAN_FAILED when all retries are exhausted", async () => {
    const updateAuditStatus = vi.fn(async () => undefined);

    vi.doMock("@/lib/supabase/server", () => ({
      updateAuditStatus,
      updateAuditProgress: vi.fn(),
      insertAuditPage: vi.fn(),
      deleteFindingsForPage: vi.fn(),
      insertFindings: vi.fn(),
      uploadEvidence: vi.fn(),
      failStaleRunningAudits: vi.fn(async () => []),
      supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }) },
    }));

    const { auditUrl } = await import("@/inngest/functions/audit-url");
    const onFailureFn = (
      auditUrl as unknown as {
        onFailureFn: (arg: { event: unknown; error: unknown }) => Promise<void>;
      }
    ).onFailureFn;

    const originalEvent = {
      name: "audit/url",
      data: { auditId: "audit-42", url: "https://example.com:8123" },
    };
    const failureEvent = {
      data: {
        error: { name: "Error", message: "connect ECONNREFUSED" },
        event: originalEvent,
        function_id: "audit-url",
      },
    };

    await onFailureFn({
      event: failureEvent,
      error: new Error("connect ECONNREFUSED"),
    });

    expect(updateAuditStatus).toHaveBeenCalledWith(
      "audit-42",
      "failed",
      expect.objectContaining({
        error_code: "SCAN_FAILED",
        error_detail: expect.stringContaining("ECONNREFUSED"),
      })
    );
  });
});
