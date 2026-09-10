import { describe, it, expect, vi, beforeEach } from "vitest";

// Confirmed live (separate investigation): cancelling a QUEUED audit set its
// row to status="failed"/error_code="CANCELLED", but the pipeline's very
// first write -- updateAuditStatus(auditId, "running"), unconditional --
// then resurrected it. The per-page (cancel-check-${i}) and end-of-pipeline
// (cancel-check-final) guards both already existed and worked correctly;
// this was the one gap between "cancel button clicked" and "pipeline's
// first step actually runs". Real observed sequence: queued -> cancel ->
// failed/CANCELLED -> running (resurrected) -> complete, findings the user
// explicitly tried to stop generated and persisted anyway, with a
// permanently contradictory final row (status: complete, error_code:
// CANCELLED). Fixed with a cancel-check-initial guard mirroring the
// existing two.
const { getAudit, updateAuditStatus } = vi.hoisted(() => ({
  getAudit: vi.fn(),
  updateAuditStatus: vi.fn(async () => {}),
}));
vi.mock("@/lib/supabase/server", () => ({
  getAudit,
  updateAuditStatus,
  updateAuditProgress: vi.fn(),
  insertAuditPage: vi.fn(),
  deleteFindingsForPage: vi.fn(),
  insertFindings: vi.fn(),
  uploadEvidence: vi.fn(),
}));

const { crawl } = vi.hoisted(() => ({
  crawl: vi.fn(async () => {
    throw new Error("crawl() must not run once the audit is already cancelled");
  }),
}));
vi.mock("@/engine/crawl", () => ({ crawl, isBotBlocked: () => false }));

import { auditUrl } from "@/inngest/functions/audit-url";

// Minimal step stub: runs each named step's callback immediately and
// returns its result, matching how Inngest's real step.run behaves for a
// single, non-retried invocation -- enough to drive the function up to
// (and past, if the guard fails) the point under test.
function stepStub() {
  return {
    run: (_name: string, fn: () => unknown) => Promise.resolve(fn()),
    sleep: vi.fn(),
  };
}

const handlerFn = (
  auditUrl as unknown as {
    fn: (arg: { event: unknown; step: ReturnType<typeof stepStub> }) => Promise<unknown>;
  }
).fn;

beforeEach(() => {
  getAudit.mockReset();
  updateAuditStatus.mockClear();
  crawl.mockClear();
});

describe("auditUrl -- cancel-check-initial guard", () => {
  it("bails out before the crawl step when the audit was already cancelled while queued", async () => {
    getAudit.mockResolvedValue({
      id: "a1",
      status: "failed",
      error_code: "CANCELLED",
    });

    const result = await handlerFn({
      event: { data: { auditId: "a1", url: "https://example.com" } },
      step: stepStub(),
    });

    expect(result).toEqual({ auditId: "a1", status: "failed" });
    expect(crawl).not.toHaveBeenCalled();
    expect(updateAuditStatus).not.toHaveBeenCalledWith("a1", "running");
  });

  it("proceeds normally when the audit is still queued", async () => {
    getAudit.mockResolvedValue({ id: "a1", status: "queued" });
    // Let the pipeline actually try to crawl -- confirms the guard doesn't
    // block the legitimate case. It's fine for this to throw further in
    // (nothing else is mocked); we only care that crawl() was reached.
    crawl.mockImplementation(async () => {
      throw new Error("stop here — crawl was reached, guard did not block it");
    });

    await handlerFn({
      event: { data: { auditId: "a1", url: "https://example.com" } },
      step: stepStub(),
    }).catch(() => {});

    expect(crawl).toHaveBeenCalled();
  });
});
