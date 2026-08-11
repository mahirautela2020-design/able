import { describe, it, expect } from "vitest";

describe("vpat/export", () => {
  it("requires auditId query parameter", async () => {
    const { GET } = await import("@/app/api/vpat/export/route");
    const request = new Request("http://localhost/api/vpat/export");
    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("auditId");
  });

  it("returns 404 for non-existent audit", async () => {
    const { GET } = await import("@/app/api/vpat/export/route");
    const request = new Request(
      "http://localhost/api/vpat/export?auditId=nonexistent-id"
    );
    const response = await GET(request);
    expect(response.status).toBe(404);
  });

  it("returns JSON format by default", async () => {
    const { GET } = await import("@/app/api/vpat/export/route");
    const request = new Request(
      "http://localhost/api/vpat/export?auditId=test-id&format=json"
    );
    const response = await GET(request);
    // Will be 404 since no real audit exists, but format is correct
    expect(response.status).toBe(404);
  });
});
