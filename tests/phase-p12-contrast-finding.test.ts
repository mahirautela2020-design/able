import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/supabase/session", () => ({
  requireSession: vi.fn(async () => ({ ok: true as const, userId: "user-1" })),
}));

const { insertFindings, uploadEvidence, auditPagesRows } = vi.hoisted(() => ({
  insertFindings: vi.fn<(rows: Record<string, unknown>[]) => Promise<void>>(async () => {}),
  uploadEvidence: vi.fn(async () => "https://example.com/evidence/crop.webp"),
  auditPagesRows: [
    { id: "page-1", page_url: "https://example.com/" },
    { id: "page-2", page_url: "https://example.com/about" },
  ],
}));

vi.mock("@/lib/supabase/server", () => ({
  getAudit: vi.fn(async (id: string) => {
    if (id === "missing-audit") throw new Error("not found");
    return { id, target_url: "https://example.com/", status: "complete" };
  }),
  supabase: {
    from: (table: string) => {
      if (table !== "audit_pages") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: async () => ({ data: auditPagesRows, error: null }),
        }),
      };
    },
  },
  insertFindings,
  uploadEvidence,
}));

const fakePage = {
  goto: vi.fn(async () => {}),
};

vi.mock("@/engine/browser", () => ({
  withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) => fn(fakePage)),
  takeScreenshot: vi.fn(async () => Buffer.from("fake-screenshot")),
}));

vi.mock("sharp", () => {
  const chain = {
    metadata: vi.fn(async () => ({ width: 1440, height: 900 })),
    extract: vi.fn(function (this: unknown) {
      return this;
    }),
    webp: vi.fn(function (this: unknown) {
      return this;
    }),
    toBuffer: vi.fn(async () => Buffer.from("fake-crop")),
  };
  return { default: vi.fn(() => chain) };
});

import { POST } from "@/app/api/audits/[id]/contrast-finding/route";

afterEach(() => {
  insertFindings.mockClear();
  uploadEvidence.mockClear();
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/audits/audit-1/contrast-finding", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  selector: "#cta",
  elementHtml: "<button>Subscribe</button>",
  fg: "#7a7a7a",
  bg: "#ffffff",
  bbox: { x: 10, y: 20, width: 100, height: 30 },
};

describe("POST /api/audits/[id]/contrast-finding", () => {
  it("404s when the audit doesn't exist", async () => {
    const res = await POST(makeRequest(validBody), { params: Promise.resolve({ id: "missing-audit" }) });
    expect(res.status).toBe(404);
  });

  it("400s when required fields are missing", async () => {
    const res = await POST(
      makeRequest({ selector: "#cta" }),
      { params: Promise.resolve({ id: "audit-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("picks 1.4.3 when the element has text content", async () => {
    const res = await POST(makeRequest(validBody), { params: Promise.resolve({ id: "audit-1" }) });
    expect(res.status).toBe(201);
    expect(insertFindings).toHaveBeenCalledTimes(1);
    const row = insertFindings.mock.calls[0][0][0];
    expect(row.wcag_criterion).toBe("1.4.3");
  });

  it("picks 1.4.11 when the element has no text content", async () => {
    const res = await POST(
      makeRequest({ ...validBody, elementHtml: "<img src='x.png'>" }),
      { params: Promise.resolve({ id: "audit-1" }) }
    );
    expect(res.status).toBe(201);
    const row = insertFindings.mock.calls[0][0][0];
    expect(row.wcag_criterion).toBe("1.4.11");
  });

  it("computes the contrast ratio server-side and ignores any client-posted ratio", async () => {
    const res = await POST(
      makeRequest({ ...validBody, ratio: 999 }), // client tries to lie
      { params: Promise.resolve({ id: "audit-1" }) }
    );
    const json = await res.json();
    expect(json.ratio).toBeCloseTo(4.29, 1); // real ratio for #7a7a7a on #ffffff
    expect(json.ratio).not.toBe(999);
  });

  it("resolves pageId by matching the audit's target_url when none is supplied", async () => {
    await POST(makeRequest(validBody), { params: Promise.resolve({ id: "audit-1" }) });
    const row = insertFindings.mock.calls[0][0][0];
    expect(row.page_id).toBe("page-1"); // matches target_url https://example.com/
  });

  it("persists source_engines:['contrast-lab'], confidence 1, and evidence with fg/bg/ratio/apcaLc", async () => {
    await POST(makeRequest(validBody), { params: Promise.resolve({ id: "audit-1" }) });
    const row = insertFindings.mock.calls[0][0][0];
    expect(row.source_engines).toEqual(["contrast-lab"]);
    expect(row.confidence).toBe(1);
    const evidence = row.evidence as { fg: string; bg: string; ratio: number; apcaLc: number };
    expect(evidence.fg).toBe("#7a7a7a");
    expect(evidence.bg).toBe("#ffffff");
    expect(typeof evidence.ratio).toBe("number");
    expect(typeof evidence.apcaLc).toBe("number");
    expect(row.screenshot_crop_url).toBe("https://example.com/evidence/crop.webp");
  });
});
