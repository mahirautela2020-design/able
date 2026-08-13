import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

const { mockGetAudit, mockGetAuditPageId, mockInsertFindings, mockUploadEvidence } = vi.hoisted(() => ({
  mockGetAudit: vi.fn<() => Promise<{ id: string; target_url: string; created_ip: string | null }>>(),
  mockGetAuditPageId: vi.fn<(auditId: string, pageUrl?: string) => Promise<string | null>>(),
  mockInsertFindings: vi.fn<(rows: Record<string, unknown>[]) => Promise<void>>(async () => undefined),
  mockUploadEvidence: vi.fn<(buf: Buffer, path: string) => Promise<string>>(
    async (_buf: Buffer, path: string) => `https://example.com/evidence/${path}`
  ),
}));

vi.mock("@/lib/supabase/server", () => ({
  getAudit: mockGetAudit,
  getAuditPageId: mockGetAuditPageId,
  insertFindings: mockInsertFindings,
  uploadEvidence: mockUploadEvidence,
}));

vi.mock("@/lib/supabase/session", () => ({
  requireSession: vi.fn(async () => ({ ok: true as const, userId: "user-1" })),
}));

vi.mock("@/lib/ssrf", () => ({
  sanitizeUrl: (u: string) => {
    try {
      return new URL(u);
    } catch {
      return null;
    }
  },
  validateHost: vi.fn(async () => undefined),
  validateHostSync: vi.fn(() => undefined),
}));

vi.mock("@/engine/browser", () => ({
  withPage: async (
    fn: (page: { goto: () => Promise<void>; screenshot: () => Promise<Buffer> }) => Promise<Buffer>
  ) => {
    const fakeScreenshot = await sharp({
      create: { width: 1440, height: 900, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
    const page = {
      goto: async () => undefined,
      screenshot: async () => fakeScreenshot,
    };
    return fn(page);
  },
}));

import { POST } from "@/app/api/audits/[id]/contrast-finding/route";

function makeRequest(body: unknown): Request {
  return new Request("https://example.com/api/audits/audit-1/contrast-finding", {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  });
}

const routeParams = { params: Promise.resolve({ id: "audit-1" }) };

const validAudit = { id: "audit-1", target_url: "https://target.example.com", created_ip: null };

describe("POST /api/audits/[id]/contrast-finding", () => {
  beforeEach(() => {
    mockGetAudit.mockReset();
    mockGetAuditPageId.mockReset();
    mockInsertFindings.mockReset().mockResolvedValue(undefined);
    mockUploadEvidence.mockClear();
    mockGetAudit.mockResolvedValue(validAudit);
    mockGetAuditPageId.mockResolvedValue("page-1");
  });

  it("returns 404 when the audit does not exist", async () => {
    mockGetAudit.mockRejectedValue(new Error("not found"));
    const res = await POST(makeRequest({}), routeParams);
    expect(res.status).toBe(404);
  });

  it("returns 400 when fg/bg are missing", async () => {
    const res = await POST(
      makeRequest({ selector: "#a", bbox: { x: 0, y: 0, width: 10, height: 10 } }),
      routeParams
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when bbox is missing", async () => {
    const res = await POST(
      makeRequest({ selector: "#a", fg: "#7a7a7a", bg: "#ffffff" }),
      routeParams
    );
    expect(res.status).toBe(400);
  });

  it("refuses to fabricate a finding for a pair that already passes AA", async () => {
    const res = await POST(
      makeRequest({
        selector: "#a",
        fg: "#000000",
        bg: "#ffffff",
        bbox: { x: 0, y: 0, width: 40, height: 20 },
      }),
      routeParams
    );
    expect(res.status).toBe(400);
    expect(mockInsertFindings).not.toHaveBeenCalled();
  });

  it("returns 404 when the audit has no scanned pages", async () => {
    mockGetAuditPageId.mockResolvedValue(null);
    const res = await POST(
      makeRequest({
        selector: "#a",
        fg: "#7a7a7a",
        bg: "#ffffff",
        bbox: { x: 10, y: 10, width: 40, height: 20 },
      }),
      routeParams
    );
    expect(res.status).toBe(404);
  });

  it("persists a 1.4.3 (text) finding for a failing pair with text content", async () => {
    const res = await POST(
      makeRequest({
        selector: "#cta",
        elementHtml: "<button id=\"cta\">Subscribe</button>",
        fg: "#7a7a7a",
        bg: "#ffffff",
        hasText: true,
        bbox: { x: 20, y: 20, width: 100, height: 30 },
        viewport: { width: 1440, height: 900 },
      }),
      routeParams
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.criterion).toBe("1.4.3");
    expect(json.ratio).toBeLessThan(4.5);

    expect(mockInsertFindings).toHaveBeenCalledTimes(1);
    const [rows] = mockInsertFindings.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      audit_id: "audit-1",
      page_id: "page-1",
      bucket: "automated",
      wcag_criterion: "1.4.3",
      source_engines: ["contrast-lab"],
    });
    expect(rows[0].screenshot_crop_url).toMatch(/^https:\/\/example\.com\/evidence\//);
    expect(mockUploadEvidence).toHaveBeenCalledTimes(1);
  });

  it("persists a 1.4.11 (non-text) finding when the element has no text content", async () => {
    const res = await POST(
      makeRequest({
        selector: "#icon",
        fg: "#cccccc",
        bg: "#ffffff",
        hasText: false,
        bbox: { x: 5, y: 5, width: 24, height: 24 },
      }),
      routeParams
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.criterion).toBe("1.4.11");

    const [rows] = mockInsertFindings.mock.calls[0];
    expect(rows[0].wcag_criterion).toBe("1.4.11");
    expect(rows[0].severity).toBe("serious");
  });

  it("still persists the finding (without a crop) if the screenshot step fails", async () => {
    mockGetAuditPageId.mockResolvedValue("page-2");
    const res = await POST(
      makeRequest({
        selector: "#a",
        fg: "#7a7a7a",
        bg: "#ffffff",
        bbox: { x: 0, y: 0, width: 10, height: 10 },
        pageUrl: "not a url", // sanitizeUrl() rejects this → screenshot step is skipped
      }),
      routeParams
    );
    expect(res.status).toBe(200);
    const [rows] = mockInsertFindings.mock.calls[0];
    expect(rows[0].screenshot_crop_url).toBeNull();
  });
});
