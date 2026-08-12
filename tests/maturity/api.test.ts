import { describe, it, expect, vi, beforeEach } from "vitest";

const authRequest = (init: RequestInit = {}, url = "http://localhost/api/maturity"): Request =>
  new Request(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
      ...(init.headers as Record<string, string>),
    },
  });

describe("maturity/api", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      supabase: {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "test-user" } },
            error: null,
          }),
        },
      },
    }));
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
  });

  it("validates answers are required", async () => {
    const { POST } = await import("@/app/api/maturity/route");
    const request = authRequest({ method: "POST", body: JSON.stringify({}) });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("returns computed score for valid answers", async () => {
    const { POST } = await import("@/app/api/maturity/route");
    const answers: Record<string, number> = {};
    const ids = [
      "gov-1", "gov-2", "gov-3", "gov-4", "gov-5",
      "design-1", "design-2", "design-3", "design-4", "design-5",
      "dev-1", "dev-2", "dev-3", "dev-4", "dev-5",
      "qa-1", "qa-2", "qa-3", "qa-4", "qa-5",
      "ops-1", "ops-2", "ops-3", "ops-4", "ops-5",
    ];
    for (const id of ids) {
      answers[id] = 3;
    }
    const request = authRequest({
      method: "POST",
      body: JSON.stringify({ answers }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.overall).toBeDefined();
    expect(body.level).toBeDefined();
    expect(body.byDomain).toBeDefined();
    expect(body.byDomain).toHaveLength(5);
  });

  it("handles invalid JSON body", async () => {
    const { POST } = await import("@/app/api/maturity/route");
    const request = authRequest({ method: "POST", body: "{not-json" });
    const response = await POST(request);
    expect(response.status).toBe(500);
  });

  it("rejects requests without a session (401)", async () => {
    const { POST } = await import("@/app/api/maturity/route");
    const request = new Request("http://localhost/api/maturity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: { "gov-1": 3 } }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
