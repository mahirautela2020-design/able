import { describe, it, expect, vi } from "vitest";
import { requireEnterpriseAuth } from "@/lib/enterprise/auth";

function createGetUserMock(user: Record<string, unknown> | null) {
  return vi.fn().mockResolvedValue({
    data: { user },
    error: null,
  });
}

function createGetUserError() {
  return vi.fn().mockResolvedValue({
    data: { user: null },
    error: { message: "invalid" },
  });
}

function createFromMock(data: Record<string, unknown> | null) {
  return vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error: null }),
        }),
      }),
    }),
  });
}

function createClient(getUserImpl: ReturnType<typeof vi.fn>, fromImpl: ReturnType<typeof vi.fn>) {
  return {
    auth: { getUser: getUserImpl },
    from: fromImpl,
  };
}

function createRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/test", { headers: new Headers(headers) });
}

describe("enterprise auth", () => {
  it("returns 401 when no authorization header", async () => {
    const client = createClient(vi.fn(), vi.fn());
    const req = createRequest();
    const result = await requireEnterpriseAuth(req, {}, client);
    expect(result.response).toBeDefined();
    expect(result.response?.status).toBe(401);
  });

  it("returns 401 for invalid token", async () => {
    const client = createClient(createGetUserError(), createFromMock(null));
    const req = createRequest({ authorization: "Bearer invalid" });
    const result = await requireEnterpriseAuth(req, {}, client);
    expect(result.response?.status).toBe(401);
  });

  it("returns 403 when user has no org_id in app_metadata", async () => {
    const client = createClient(
      createGetUserMock({ id: "user-1", app_metadata: {} }),
      vi.fn()
    );
    const req = createRequest({ authorization: "Bearer valid" });
    const result = await requireEnterpriseAuth(req, {}, client);
    expect(result.response?.status).toBe(403);
  });

  it("returns 403 when not a member of org", async () => {
    const client = createClient(
      createGetUserMock({ id: "user-1", app_metadata: { org_id: "org-1" } }),
      createFromMock(null)
    );
    const req = createRequest({ authorization: "Bearer valid" });
    const result = await requireEnterpriseAuth(req, {}, client);
    expect(result.response?.status).toBe(403);
  });

  it("returns 403 for suspended membership", async () => {
    const client = createClient(
      createGetUserMock({ id: "user-1", app_metadata: { org_id: "org-1" } }),
      createFromMock({ role: "auditor", status: "suspended" })
    );
    const req = createRequest({ authorization: "Bearer valid" });
    const result = await requireEnterpriseAuth(req, {}, client);
    expect(result.response?.status).toBe(403);
  });

  it("returns 403 for unaccepted invitation", async () => {
    const client = createClient(
      createGetUserMock({ id: "user-1", app_metadata: { org_id: "org-1" } }),
      createFromMock({ role: "auditor", status: "invited" })
    );
    const req = createRequest({ authorization: "Bearer valid" });
    const result = await requireEnterpriseAuth(req, {}, client);
    expect(result.response?.status).toBe(403);
  });

  it("returns session for valid user with active membership", async () => {
    const client = createClient(
      createGetUserMock({ id: "user-1", app_metadata: { org_id: "org-1" } }),
      createFromMock({ role: "auditor", status: "active" })
    );
    const req = createRequest({ authorization: "Bearer valid" });
    const result = await requireEnterpriseAuth(req, {}, client);
    expect(result.session).toBeDefined();
    expect(result.session?.userId).toBe("user-1");
    expect(result.session?.orgId).toBe("org-1");
    expect(result.session?.role).toBe("auditor");
    expect(result.session?.membershipStatus).toBe("active");
  });

  it("returns 403 when user lacks required permission", async () => {
    const client = createClient(
      createGetUserMock({ id: "user-1", app_metadata: { org_id: "org-1" } }),
      createFromMock({ role: "viewer", status: "active" })
    );
    const req = createRequest({ authorization: "Bearer valid" });
    const result = await requireEnterpriseAuth(req, { requiredPermission: "apikey:manage" }, client);
    expect(result.response?.status).toBe(403);
  });

  it("returns session when user has required permission", async () => {
    const client = createClient(
      createGetUserMock({ id: "user-1", app_metadata: { org_id: "org-1" } }),
      createFromMock({ role: "owner", status: "active" })
    );
    const req = createRequest({ authorization: "Bearer valid" });
    const result = await requireEnterpriseAuth(req, { requiredPermission: "apikey:manage" }, client);
    expect(result.session).toBeDefined();
    expect(result.response).toBeUndefined();
  });
});
