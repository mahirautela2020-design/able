import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env.server", () => ({
  getFigmaPat: () => "test-pat-123",
}));

import { getFile, getNode, getImages, getFileNodes } from "@/lib/figma/client";

describe("figma-client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  function mockFigmaResponse(status: number, body: unknown) {
    vi.mocked(fetch).mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    } as Response);
  }

  it("constructs correct URL and headers for getFile", async () => {
    mockFigmaResponse(200, { document: {}, name: "test", lastModified: "2026-01-01" });

    await getFile("abc123");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.figma.com/v1/files/abc123?depth=4",
      { headers: { "X-Figma-Token": "test-pat-123" } }
    );
  });

  it("always uses HTTPS and api.figma.com host (SSRF safe)", async () => {
    mockFigmaResponse(200, { document: {}, name: "test", lastModified: "2026-01-01" });

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
    mockFigmaResponse(200, { document: {}, name: "test", lastModified: "2026-01-01" });

    await expect(getFile("AbCdEf123")).resolves.toBeDefined();
  });

  it("throws on non-200 response", async () => {
    mockFigmaResponse(403, { err: "Forbidden" });

    await expect(getFile("abc123")).rejects.toThrow("Figma API error");
  });

  it("getNode returns node data for valid nodeId", async () => {
    mockFigmaResponse(200, {
      nodes: { "1:2": { document: { id: "1:2", type: "FRAME" } } },
    });

    const result = await getNode("abc123", "1:2");
    expect(result).toBeDefined();
    expect(result!.document).toBeDefined();
  });

  it("getNode returns null for missing nodeId", async () => {
    mockFigmaResponse(200, { nodes: {} });

    const result = await getNode("abc123", "99:99");
    expect(result).toBeNull();
  });

  it("getImages returns URL map", async () => {
    mockFigmaResponse(200, {
      images: { "1:2": "https://s3-alpha.figma.com/img/abc.png", "1:3": null },
    });

    const result = await getImages("abc123", ["1:2", "1:3"]);
    expect(result["1:2"]).toBe("https://s3-alpha.figma.com/img/abc.png");
    expect(result["1:3"]).toBeNull();
  });

  it("getFileNodes calls nodes endpoint", async () => {
    mockFigmaResponse(200, { nodes: {} });

    await getFileNodes("abc123");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.figma.com/v1/files/abc123/nodes",
      { headers: { "X-Figma-Token": "test-pat-123" } }
    );
  });

  it("handles missing FIGMA_PAT gracefully (via mock override)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env.server", () => ({
      getFigmaPat: () => null,
    }));

    const { getFile: getFileNoPat } = await import("@/lib/figma/client");
    await expect(getFileNoPat("abc123")).rejects.toThrow("FIGMA_PAT not configured");

    vi.doMock("@/lib/env.server", () => ({
      getFigmaPat: () => "test-pat-123",
    }));
  });
});
