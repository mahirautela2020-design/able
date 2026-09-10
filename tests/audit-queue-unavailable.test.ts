import { describe, it, expect, vi, afterEach } from "vitest";

// Reproduces exactly what the user hit: insertAudit succeeds (the row is
// created and, critically, now counts against the caller's daily anonymous
// limit), then inngest.send() throws (no local Inngest dev server running,
// or a genuine outage) -- which used to escape uncaught into a bare
// "Internal server error" 500, leaving the row stuck at status="queued"
// forever (failStaleRunningAudits only rescues "running", never "queued").
// On retry the user then hit ANON_LIMIT_REACHED, because the orphaned row
// from the failed attempt still counted.
vi.mock("@/engine/crawl", () => ({
  sanitizeUrl: vi.fn((url: string) => new URL(url)),
  validateHost: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/session", () => ({
  requireSession: vi.fn(async () => ({ ok: false as const })),
}));

const { insertAudit, updateAuditStatus, sendMock } = vi.hoisted(() => ({
  insertAudit: vi.fn(async () => "audit-123"),
  updateAuditStatus: vi.fn(async () => {}),
  sendMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/server", () => ({
  insertAudit,
  updateAuditStatus,
  getRecentAudits: vi.fn(async () => []),
  deleteAudit: vi.fn(async () => true),
  countAuditsByIp: vi.fn(async () => 0),
  getAudit: vi.fn(async () => null),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: sendMock },
}));

import { POST } from "@/app/api/audits/route";

afterEach(() => {
  vi.clearAllMocks();
});

function req(url = "https://www.qantas.com/en-au"): Request {
  return new Request("http://localhost/api/audits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

describe("POST /api/audits — queue failure after the row already exists", () => {
  it("marks the row failed and returns a clear error instead of a bare 500, when inngest.send() throws", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })
    );

    const res = await POST(req());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/background worker|unavailable/i);
    expect(body.id).toBe("audit-123");

    expect(updateAuditStatus).toHaveBeenCalledWith(
      "audit-123",
      "failed",
      expect.objectContaining({ error_code: "QUEUE_UNAVAILABLE" })
    );
  });

  it("never leaves the row at status=queued: the failed write always fires when queueing fails", async () => {
    sendMock.mockRejectedValueOnce(new Error("queue down"));
    await POST(req());
    expect(updateAuditStatus).toHaveBeenCalledTimes(1);
  });

  it("still succeeds normally when both sends work", async () => {
    const res = await POST(req());
    expect(res.status).toBe(201);
    expect(updateAuditStatus).not.toHaveBeenCalled();
  });

  it("a failing psi-preview send does not fail the request — the audit was already queued", async () => {
    // First call (audit/url) succeeds, second (psi-preview) rejects.
    sendMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("psi down"));

    const res = await POST(req());

    expect(res.status).toBe(201);
    expect(updateAuditStatus).not.toHaveBeenCalled();
  });
});
