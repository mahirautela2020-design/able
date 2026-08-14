import { describe, it, expect, vi, afterEach } from "vitest";

const { insertAudit, sendMock } = vi.hoisted(() => ({
  insertAudit: vi.fn(async () => "audit-123"),
  sendMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/server", () => ({
  insertAudit,
  getFindingsForAudit: vi.fn(async () => []),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: sendMock },
}));

import { startAudit } from "@/lib/mcp/wrapper";

afterEach(() => {
  vi.clearAllMocks();
});

describe("mcp wrapper startAudit", () => {
  it("regression: sends the audit/url Inngest event so MCP-created audits actually scan (previously never called inngest.send at all)", async () => {
    const result = await startAudit({ url: "https://example.com" });

    expect(insertAudit).toHaveBeenCalledWith("https://example.com", {});
    expect(sendMock).toHaveBeenCalledWith({
      name: "audit/url",
      data: { auditId: "audit-123", url: "https://example.com" },
    });
    expect(result).toEqual({ auditId: "audit-123", status: "queued" });
  });
});
