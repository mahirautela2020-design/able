import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env.server", () => ({
  getFigmaPat: () => "figd_test-pat-123",
}));

import { getFile, getNode, extractFileKey, MAX_FILE_BYTES } from "@/lib/figma/client";

describe("figma-client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  /** Shape of the subset of Response the client touches: ok/status/headers,
   * plus text() (getFile buffers through it) and json() (getNode). */
  function figmaResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      text: async () => JSON.stringify(body),
      json: async () => body,
    } as Response;
  }

  function mockFigmaResponse(status: number, body: unknown, headers?: Record<string, string>) {
    vi.mocked(fetch).mockResolvedValue(figmaResponse(status, body, headers));
  }

  const FILE_BODY = { document: {}, name: "test", lastModified: "2026-01-01" };

  it("fetches the full tree — no depth cap that would hide leaf nodes", async () => {
    mockFigmaResponse(200, FILE_BODY);

    const result = await getFile("abc123");

    expect(fetch).toHaveBeenCalledWith("https://api.figma.com/v1/files/abc123", {
      headers: { "X-Figma-Token": "figd_test-pat-123" },
    });
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).not.toContain("depth");
    expect(result.truncated).toBe(false);
  });

  it("always uses HTTPS and api.figma.com host (SSRF safe)", async () => {
    mockFigmaResponse(200, FILE_BODY);

    await getFile("abc123");

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.length).toBe(1);
    const url = calls[0]![0] as string;
    expect(url).toMatch(/^https:\/\/api\.figma\.com\//);
  });

  it("rejects invalid file key (non-alphanumeric)", async () => {
    await expect(getFile("abc!@#")).rejects.toThrow("Invalid file key");
  });

  it("accepts valid file key with mixed case", async () => {
    mockFigmaResponse(200, FILE_BODY);

    await expect(getFile("AbCdEf123")).resolves.toBeDefined();
  });

  it("throws on non-200 response", async () => {
    mockFigmaResponse(403, { err: "Forbidden" });

    await expect(getFile("abc123")).rejects.toThrow("Figma API error");
  });

  describe("auth header selection", () => {
    it("sends a figd_ personal access token as X-Figma-Token", async () => {
      mockFigmaResponse(200, FILE_BODY);

      await getFile("abc123", "figd_user_pat_456");

      expect(fetch).toHaveBeenCalledWith(expect.any(String), {
        headers: { "X-Figma-Token": "figd_user_pat_456" },
      });
    });

    it("sends an OAuth access token as Authorization: Bearer, never X-Figma-Token", async () => {
      mockFigmaResponse(200, FILE_BODY);

      await getFile("abc123", "oauth-access-token-xyz");

      const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
      expect(init.headers).toEqual({ Authorization: "Bearer oauth-access-token-xyz" });
      expect(init.headers).not.toHaveProperty("X-Figma-Token");
    });

    it("picks the header per call, so getNode follows the same rule", async () => {
      mockFigmaResponse(200, { nodes: { "1:2": { document: {} } } });

      await getNode("abc123", "1:2", "oauth-access-token-xyz");

      const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
      expect(init.headers).toEqual({ Authorization: "Bearer oauth-access-token-xyz" });
    });
  });

  describe("oversized-file guard", () => {
    it("falls back to a bounded depth and flags truncation when content-length is over the cap", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          figmaResponse(200, FILE_BODY, { "content-length": String(MAX_FILE_BYTES + 1) })
        )
        .mockResolvedValueOnce(figmaResponse(200, FILE_BODY));

      const result = await getFile("abc123");

      expect(result.truncated).toBe(true);
      expect(vi.mocked(fetch).mock.calls[1]![0]).toBe(
        "https://api.figma.com/v1/files/abc123?depth=4"
      );
    });

    it("also catches an oversized body when content-length is absent", async () => {
      const huge = "x".repeat(MAX_FILE_BYTES + 1);
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => huge,
          json: async () => FILE_BODY,
        } as Response)
        .mockResolvedValueOnce(figmaResponse(200, FILE_BODY));

      const result = await getFile("abc123");

      expect(result.truncated).toBe(true);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    });

    it("does not flag truncation for a normal-sized file", async () => {
      mockFigmaResponse(200, FILE_BODY, { "content-length": "1024" });

      const result = await getFile("abc123");

      expect(result.truncated).toBe(false);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });
  });

  describe("getNode", () => {
    it("returns node data for valid nodeId", async () => {
      mockFigmaResponse(200, {
        nodes: { "1:2": { document: { id: "1:2", type: "FRAME" } } },
      });

      const result = await getNode("abc123", "1:2");
      expect(result).toBeDefined();
      expect(result!.document).toBeDefined();
    });

    it("returns null for missing nodeId", async () => {
      mockFigmaResponse(200, { nodes: {} });

      const result = await getNode("abc123", "99:99");
      expect(result).toBeNull();
    });

    it("normalizes a dashed share-URL node id to the colon form the API uses", async () => {
      mockFigmaResponse(200, {
        nodes: { "1953:9007": { document: { id: "1953:9007", type: "FRAME" } } },
      });

      const result = await getNode("abc123", "1953-9007");

      expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(
        "https://api.figma.com/v1/files/abc123/nodes?ids=1953%3A9007"
      );
      expect(result).not.toBeNull();
      expect(result!.document).toEqual({ id: "1953:9007", type: "FRAME" });
    });
  });

  describe("extractFileKey", () => {
    it("accepts a bare file key", () => {
      expect(extractFileKey("AbCdEf123")).toBe("AbCdEf123");
    });

    it.each(["design", "file", "proto", "board", "slides", "deck"])(
      "extracts the key from a /%s/ share URL",
      (product) => {
        expect(extractFileKey(`https://www.figma.com/${product}/AbC123/My-Design`)).toBe("AbC123");
      }
    );

    it("returns null rather than a truncated key when the segment is not all base62", () => {
      // Unanchored, `([A-Za-z0-9]+)` matched the "abc" prefix and 404'd against
      // a file key that was never in the URL.
      expect(extractFileKey("https://www.figma.com/design/abc-123def/Name")).toBeNull();
    });

    it("extracts a key from a URL with no trailing path segment", () => {
      expect(extractFileKey("https://www.figma.com/design/AbC123")).toBe("AbC123");
    });

    it("rejects a non-figma host", () => {
      expect(extractFileKey("https://evil.com/design/AbC123/x")).toBeNull();
    });
  });

  it("handles missing FIGMA_PAT gracefully (via mock override)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env.server", () => ({
      getFigmaPat: () => null,
    }));

    const { getFile: getFileNoPat } = await import("@/lib/figma/client");
    await expect(getFileNoPat("abc123")).rejects.toThrow("FIGMA_PAT not configured");

    vi.doMock("@/lib/env.server", () => ({
      getFigmaPat: () => "figd_test-pat-123",
    }));
  });
});
