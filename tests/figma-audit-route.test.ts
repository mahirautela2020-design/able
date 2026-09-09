import { describe, it, expect, vi, beforeEach } from "vitest";

const { getFile, getNode } = vi.hoisted(() => ({
  getFile: vi.fn(),
  getNode: vi.fn(),
}));

// Only the network calls are stubbed — extractFileKey stays real so the route
// test exercises the share-URL parsing it actually ships with.
vi.mock("@/lib/figma/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/figma/client")>();
  return { ...actual, getFile, getNode };
});

vi.mock("@/lib/env.server", () => ({
  isFigmaAuditPublic: () => true,
  getFigmaPat: () => "figd_test-pat-123",
}));
vi.mock("@/lib/supabase/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getFigmaConnection: vi.fn() }));

import { POST } from "@/app/api/audit/figma/route";

function fileResult(truncated: boolean) {
  return {
    name: "Design",
    lastModified: "2026-01-01T00:00:00Z",
    truncated,
    document: {
      id: "0:0",
      name: "Document",
      type: "DOCUMENT",
      children: [{ id: "0:1", name: "Page 1", type: "CANVAS", children: [] }],
    },
  };
}

function req(body: unknown) {
  return new Request("http://localhost/api/audit/figma", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getFile.mockReset();
  getNode.mockReset();
});

describe("POST /api/audit/figma", () => {
  it("reports truncated: false when the whole file was fetched", async () => {
    getFile.mockResolvedValue(fileResult(false));

    const res = await POST(req({ fileKey: "abc123" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary.truncated).toBe(false);
    expect(data.summary.truncationNote).toBeUndefined();
  });

  it("surfaces truncation in the summary so zero findings is not read as 'clean'", async () => {
    getFile.mockResolvedValue(fileResult(true));

    const res = await POST(req({ fileKey: "abc123" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.findings).toEqual([]);
    expect(data.summary.truncated).toBe(true);
    expect(data.summary.truncationNote).toMatch(/incomplete/i);
  });

  it("does not flag truncation for a node-scoped audit — that subtree is complete", async () => {
    getFile.mockResolvedValue(fileResult(true));
    getNode.mockResolvedValue({
      document: {
        id: "1953:9007",
        name: "Frame",
        type: "FRAME",
        children: [{ id: "1953:9008", name: "Inner", type: "FRAME", children: [] }],
      },
    });

    const res = await POST(req({ fileKey: "abc123", nodeId: "1953-9007" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary.truncated).toBe(false);
  });

  it("answers an expired Figma token with a token error, not a sign-in 401", async () => {
    getFile.mockRejectedValue(
      new Error('Figma API error (401): {"err":"Token has expired"}')
    );

    const res = await POST(req({ fileKey: "abc123" }));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toMatch(/expired or been revoked/i);
    expect(data.error).not.toMatch(/sign in/i);
  });

  it("accepts a board share URL as the file key", async () => {
    getFile.mockResolvedValue(fileResult(false));

    const res = await POST(req({ fileKey: "https://www.figma.com/board/AbC123/Notes" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.fileKey).toBe("AbC123");
    expect(getFile).toHaveBeenCalledWith("AbC123", null);
  });
});
