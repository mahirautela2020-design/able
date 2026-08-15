import { describe, it, expect, vi, beforeEach } from "vitest";

const { getAudit, updateAuditStatus } = vi.hoisted(() => ({
  getAudit: vi.fn(),
  updateAuditStatus: vi.fn(async () => {}),
}));
vi.mock("@/lib/supabase/server", () => ({ getAudit, updateAuditStatus }));

const { requireSession } = vi.hoisted(() => ({
  requireSession: vi.fn(async () => ({ ok: true, userId: "u1" })),
}));
vi.mock("@/lib/supabase/session", () => ({ requireSession }));
vi.mock("@/lib/http", () => ({ getClientIp: () => "1.2.3.4" }));

import { POST } from "@/app/api/audits/[id]/cancel/route";

const base = {
  id: "a1",
  target_url: "https://example.com",
  status: "running",
  created_by: "u1",
  created_ip: "1.2.3.4",
  error_code: null,
};

beforeEach(() => {
  getAudit.mockResolvedValue({ ...base });
  requireSession.mockResolvedValue({ ok: true, userId: "u1" });
  updateAuditStatus.mockClear();
});

function req() {
  return new Request("http://localhost/api/audits/a1/cancel", { method: "POST" });
}

describe("POST /api/audits/[id]/cancel", () => {
  it("stops a running audit owned by the caller, marking it failed/CANCELLED", async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    expect(updateAuditStatus).toHaveBeenCalledWith(
      "a1",
      "failed",
      expect.objectContaining({ error_code: "CANCELLED" })
    );
  });

  it("401s a caller who does not own the audit", async () => {
    requireSession.mockResolvedValue({ ok: true, userId: "someone-else" });
    const res = await POST(req(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
    expect(updateAuditStatus).not.toHaveBeenCalled();
  });

  it("409s an audit that is not queued/running (nothing to stop)", async () => {
    getAudit.mockResolvedValue({ ...base, status: "complete" });
    const res = await POST(req(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(409);
    expect(updateAuditStatus).not.toHaveBeenCalled();
  });
});
