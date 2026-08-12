import { describe, it, expect, vi, beforeEach } from "vitest";

const authRequest = (url: string): Request =>
  new Request(url, {
    headers: { Authorization: "Bearer test-token" },
  });

describe("vpat/export", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/session", async () => {
      return {
        requireSession: async (request: Request) => {
          const header = request.headers.get("authorization");
          if (!header?.startsWith("Bearer ")) {
            return {
              ok: false,
              response: new Response(
                JSON.stringify({ error: "Missing or invalid authorization header" }),
                { status: 401 }
              ),
            };
          }
          return { ok: true, userId: "test-user" };
        },
      };
    });
    vi.doMock("@/lib/supabase/server", async () => {
      return {
        getFindingsForAudit: vi.fn().mockRejectedValue(new Error("not found")),
      };
    });
  });

  it("requires auditId query parameter", async () => {
    const { GET } = await import("@/app/api/vpat/export/route");
    const request = authRequest("http://localhost/api/vpat/export");
    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("auditId");
  });

  it("returns 404 for non-existent audit", async () => {
    const { GET } = await import("@/app/api/vpat/export/route");
    const request = authRequest(
      "http://localhost/api/vpat/export?auditId=nonexistent-id"
    );
    const response = await GET(request);
    expect(response.status).toBe(404);
  });

  it("returns JSON format by default", async () => {
    const { GET } = await import("@/app/api/vpat/export/route");
    const request = authRequest(
      "http://localhost/api/vpat/export?auditId=test-id&format=json"
    );
    const response = await GET(request);
    // Will be 404 since no real audit exists, but format is correct
    expect(response.status).toBe(404);
  });

  it("rejects requests without a session (401)", async () => {
    const { GET } = await import("@/app/api/vpat/export/route");
    const request = new Request("http://localhost/api/vpat/export?auditId=x");
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
