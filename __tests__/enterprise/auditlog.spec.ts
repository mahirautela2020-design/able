import { describe, it, expect, beforeEach, vi } from "vitest";

const mockInsert = vi.fn();

const mockSupabase = {
  from: vi.fn().mockReturnValue({
    insert: mockInsert,
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  supabase: mockSupabase,
}));

describe("auditlog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a log entry with correct fields", async () => {
    mockInsert.mockResolvedValue({ error: null });

    const { recordAuditLog } = await import("@/lib/enterprise/ratelimit");
    await recordAuditLog({
      actor: "user-1",
      action: "audit:write",
      target: "audit-123",
      orgId: "org-1",
    });

    expect(mockInsert).toHaveBeenCalledWith({
      actor: "user-1",
      action: "audit:write",
      target: "audit-123",
      org_id: "org-1",
      metadata: {},
    });
  });

  it("includes metadata when provided", async () => {
    mockInsert.mockResolvedValue({ error: null });

    const { recordAuditLog } = await import("@/lib/enterprise/ratelimit");
    await recordAuditLog({
      actor: "user-2",
      action: "apikey:issue",
      target: "key-5",
      metadata: { ip: "127.0.0.1" },
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { ip: "127.0.0.1" },
      })
    );
  });

  it("handles org_id as null when not provided", async () => {
    mockInsert.mockResolvedValue({ error: null });

    const { recordAuditLog } = await import("@/lib/enterprise/ratelimit");
    await recordAuditLog({
      actor: "system",
      action: "health:check",
      target: "service",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: null,
      })
    );
  });

  it("retries on transient failures", async () => {
    mockInsert
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue({ error: null });

    const { recordAuditLog } = await import("@/lib/enterprise/ratelimit");
    await recordAuditLog({
      actor: "user-3",
      action: "report:read",
      target: "report-1",
    });

    expect(mockInsert).toHaveBeenCalledTimes(2);
  });
});
