import { describe, it, expect, beforeEach, vi } from "vitest";

const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  supabase: mockSupabase,
}));

describe("apikeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("issueApiKey", () => {
    it("issues a key with correct prefix and structure", async () => {
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "key-1" },
              error: null,
            }),
          }),
        }),
      });

      const { issueApiKey } = await import("@/lib/enterprise/apikeys");
      const result = await issueApiKey("org-1", "user-1", "test-key", "admin");

      expect(result.id).toBe("key-1");
      expect(result.name).toBe("test-key");
      expect(result.role).toBe("admin");
      expect(result.key).toMatch(/^able_/);
      expect(result.prefix).toMatch(/^able_[A-Za-z0-9_-]{8}$/);
      expect(result.expiresAt).toBeNull();
    });

    it("sets expiry when expiresInDays is provided", async () => {
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "key-2" },
              error: null,
            }),
          }),
        }),
      });

      const { issueApiKey } = await import("@/lib/enterprise/apikeys");
      const result = await issueApiKey("org-1", "user-1", "test-key", "viewer", 30);

      expect(result.expiresAt).toBeTruthy();
      const expiresAt = new Date(result.expiresAt!);
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 86_400_000);
      expect(Math.abs(expiresAt.getTime() - thirtyDaysFromNow.getTime())).toBeLessThan(5000);
    });

    it("key plaintext is never exposed in listing (no key_hash field)", async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: "k1", name: "test", prefix: "able_xxx" }],
                error: null,
              }),
            }),
          }),
        }),
      });

      const { listApiKeys } = await import("@/lib/enterprise/apikeys");
      const keys = await listApiKeys("org-1");

      for (const key of keys) {
        expect(key).not.toHaveProperty("key_hash");
        expect(key).not.toHaveProperty("key");
      }
    });
  });

  describe("verifyApiKey", () => {
    it("returns null for invalid key", async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "not found" },
              }),
            }),
          }),
        }),
      });

      const { verifyApiKey } = await import("@/lib/enterprise/apikeys");
      const result = await verifyApiKey("invalid_key");
      expect(result).toBeNull();
    });

    it("returns null for revoked key", async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "not found" },
              }),
            }),
          }),
        }),
      });

      const { verifyApiKey } = await import("@/lib/enterprise/apikeys");
      const result = await verifyApiKey("able_revokedkey");
      expect(result).toBeNull();
    });

    it("returns null for expired key", async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "k1",
                  org_id: "org-1",
                  revoked_at: null,
                  expires_at: "2020-01-01T00:00:00Z",
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      const { verifyApiKey } = await import("@/lib/enterprise/apikeys");
      const result = await verifyApiKey("able_expired");
      expect(result).toBeNull();
    });
  });

  describe("revokeApiKey", () => {
    it("updates revoked_at timestamp, scoped to id AND org_id", async () => {
      const eqCalls: Array<[string, unknown]> = [];
      const chain = {
        eq: vi.fn((col: string, val: unknown) => {
          eqCalls.push([col, val]);
          return chain;
        }),
        select: vi.fn().mockResolvedValue({ data: [{ id: "key-1" }], error: null }),
      };
      const updateMock = vi.fn().mockReturnValue(chain);
      mockSupabase.from.mockReturnValue({
        update: updateMock,
      } as unknown as ReturnType<typeof mockSupabase.from>);

      const { revokeApiKey } = await import("@/lib/enterprise/apikeys");
      const result = await revokeApiKey("key-1", "org-1");

      expect(result.revoked).toBe(true);
      // Cross-org IDOR regression: the mutation must filter by BOTH id and
      // org_id, not id alone (see revokeApiKey's own comment for why).
      expect(eqCalls).toContainEqual(["id", "key-1"]);
      expect(eqCalls).toContainEqual(["org_id", "org-1"]);
    });

    it("reports revoked:false when no row matches (wrong org, or key doesn't exist)", async () => {
      const chain = {
        eq: vi.fn(() => chain),
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockSupabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue(chain),
      } as unknown as ReturnType<typeof mockSupabase.from>);

      const { revokeApiKey } = await import("@/lib/enterprise/apikeys");
      const result = await revokeApiKey("key-owned-by-another-org", "org-1");

      expect(result.revoked).toBe(false);
    });
  });
});
