import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/engine/crawl", () => ({
  sanitizeUrl: vi.fn((url: string) => new URL(url)),
  validateHost: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/session", () => ({
  requireSession: vi.fn(async () => ({ ok: false as const })),
}));

const { insertAudit, sendMock } = vi.hoisted(() => ({
  insertAudit: vi.fn(async () => "audit-123"),
  sendMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/server", () => ({
  insertAudit,
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

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/audits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/audits — module selection", () => {
  it("forwards a supplied modules array into insertAudit's config and the Inngest event", async () => {
    const res = await POST(
      makeRequest({ url: "https://example.com", modules: ["automated", "needs-review", "keyboard"] })
    );
    expect(res.status).toBe(201);

    expect(insertAudit).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ modules: ["automated", "needs-review", "keyboard"] }),
      expect.anything()
    );
    expect(sendMock).toHaveBeenCalledWith({
      name: "audit/url",
      data: { auditId: "audit-123", url: "https://example.com", modules: ["automated", "needs-review", "keyboard"] },
    });
  });

  it("omits modules from the event when none is supplied (existing callers unaffected)", async () => {
    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(201);

    expect(sendMock).toHaveBeenCalledWith({
      name: "audit/url",
      data: { auditId: "audit-123", url: "https://example.com" },
    });
  });

  it("ignores a malformed modules field (not an array of strings)", async () => {
    const res = await POST(makeRequest({ url: "https://example.com", modules: "not-an-array" }));
    expect(res.status).toBe(201);
    expect(sendMock).toHaveBeenCalledWith({
      name: "audit/url",
      data: { auditId: "audit-123", url: "https://example.com" },
    });
  });
});
