import { describe, it, expect, vi, beforeEach } from "vitest";

const { getAudit, deleteAudit, insertAudit, countAuditsByIp, getRecentAuditsMock } = vi.hoisted(() => ({
  getAudit: vi.fn(),
  deleteAudit: vi.fn(async () => true),
  insertAudit: vi.fn(),
  countAuditsByIp: vi.fn(async () => 0),
  getRecentAuditsMock: vi.fn(async () => []),
}));
vi.mock("@/lib/supabase/server", () => ({
  getAudit,
  deleteAudit,
  insertAudit,
  countAuditsByIp,
  getRecentAudits: getRecentAuditsMock,
}));

type SessionResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

const { requireSession } = vi.hoisted(() => ({
  requireSession: vi.fn<() => Promise<SessionResult>>(async () => ({
    ok: false,
    response: Response.json({ error: "no" }, { status: 401 }),
  })),
}));
vi.mock("@/lib/supabase/session", () => ({ requireSession }));

const { getClientIp } = vi.hoisted(() => ({ getClientIp: vi.fn(() => "9.9.9.9") }));
vi.mock("@/lib/http", () => ({ getClientIp }));
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn() } }));

import { GET, DELETE } from "@/app/api/audits/route";

const OWNED = {
  id: "owned-1",
  target_url: "https://internal.example.com",
  status: "complete",
  created_by: "user-a",
  created_ip: "9.9.9.9",
};

const ANON = {
  id: "anon-1",
  target_url: "https://example.com",
  status: "complete",
  created_by: null,
  created_ip: "9.9.9.9",
};

beforeEach(() => {
  getAudit.mockReset();
  deleteAudit.mockClear();
  getClientIp.mockReturnValue("9.9.9.9");
  requireSession.mockResolvedValue({
    ok: false,
    response: Response.json({ error: "no" }, { status: 401 }),
  });
});

describe("DELETE /api/audits — ownership check for BOTH branches", () => {
  it("401s a signed-in caller who does not own the audit (the bug: this branch had no check at all)", async () => {
    getAudit.mockResolvedValue({ ...OWNED, created_by: "user-a" });
    requireSession.mockResolvedValue({ ok: true, userId: "user-b" });

    const res = await DELETE(new Request("http://localhost/api/audits?id=owned-1", { method: "DELETE" }));

    expect(res.status).toBe(401);
    expect(deleteAudit).not.toHaveBeenCalled();
  });

  it("deletes an audit owned by the signed-in caller", async () => {
    getAudit.mockResolvedValue({ ...OWNED, created_by: "user-a" });
    requireSession.mockResolvedValue({ ok: true, userId: "user-a" });

    const res = await DELETE(new Request("http://localhost/api/audits?id=owned-1", { method: "DELETE" }));

    expect(res.status).toBe(200);
    expect(deleteAudit).toHaveBeenCalledWith("owned-1");
  });

  it("still 401s an anonymous caller from a different IP", async () => {
    getAudit.mockResolvedValue({ ...ANON });
    getClientIp.mockReturnValue("1.1.1.1");

    const res = await DELETE(new Request("http://localhost/api/audits?id=anon-1", { method: "DELETE" }));
    expect(res.status).toBe(401);
    expect(deleteAudit).not.toHaveBeenCalled();
  });

  it("lets a signed-in caller delete an anonymous audit they made from the same IP before logging in", async () => {
    getAudit.mockResolvedValue({ ...ANON });
    requireSession.mockResolvedValue({ ok: true, userId: "user-a" });

    const res = await DELETE(new Request("http://localhost/api/audits?id=anon-1", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(deleteAudit).toHaveBeenCalledWith("anon-1");
  });
});

describe("GET /api/audits — scope passed to getRecentAudits", () => {
  it("passes the caller's userId when signed in, never falling through to IP-only scope", async () => {
    requireSession.mockResolvedValue({ ok: true, userId: "user-a" });

    await GET(new Request("http://localhost/api/audits"));

    expect(getRecentAuditsMock).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ userId: "user-a" })
    );
  });
});
