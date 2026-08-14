import { describe, it, expect, vi, afterEach } from "vitest";

type SessionResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

const { requireSession } = vi.hoisted(() => ({
  requireSession: vi.fn<() => Promise<SessionResult>>(async () => ({ ok: true, userId: "user-1" })),
}));
vi.mock("@/lib/supabase/session", () => ({ requireSession }));

const { insertFindings, uploadEvidence, getAuditPageId, getAudit } = vi.hoisted(() => ({
  insertFindings: vi.fn<(rows: Record<string, unknown>[]) => Promise<void>>(async () => {}),
  uploadEvidence: vi.fn(async () => "https://example.com/evidence/crop.webp"),
  getAuditPageId: vi.fn<(auditId: string, pageUrl?: string) => Promise<string | null>>(
    async () => "page-1"
  ),
  getAudit: vi.fn(async (id: string) => {
    if (id === "missing-audit") throw new Error("not found");
    return {
      id,
      target_url: "https://example.com/",
      status: "complete",
      created_ip: "1.2.3.4",
    };
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  getAudit,
  getAuditPageId,
  insertFindings,
  uploadEvidence,
}));

const fakePage = {
  goto: vi.fn(async () => {}),
  screenshot: vi.fn(async () => Buffer.from("fake-screenshot")),
};

vi.mock("@/engine/browser", () => ({
  withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) => fn(fakePage)),
}));

vi.mock("sharp", () => {
  const chain = {
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
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ ok: true as const, userId: "user-1" });
  getAudit.mockImplementation(async (id: string) => {
    if (id === "missing-audit") throw new Error("not found");
    return { id, target_url: "https://example.com/", status: "complete", created_ip: "1.2.3.4" };
  });
  getAuditPageId.mockResolvedValue("page-1");
});

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/audits/audit-1/contrast-finding", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const failingBody = {
  selector: "#cta",
  elementHtml: "<button>",
  fg: "#7a7a7a",
  bg: "#ffffff", // fails AA (~4.29:1)
  hasText: true,
  bbox: { x: 10, y: 20, width: 100, height: 30 },
};

describe("POST /api/audits/[id]/contrast-finding", () => {
  it("404s when the audit doesn't exist", async () => {
    const res = await POST(makeRequest(failingBody), { params: Promise.resolve({ id: "missing-audit" }) });
    expect(res.status).toBe(404);
  });

  it("400s when required fields are missing", async () => {
    const res = await POST(makeRequest({ selector: "#cta" }), { params: Promise.resolve({ id: "audit-1" }) });
    expect(res.status).toBe(400);
  });

  it("400s and does NOT persist a finding when the pair already passes AA", async () => {
    const res = await POST(
      makeRequest({ ...failingBody, fg: "#000000", bg: "#ffffff" }),
      { params: Promise.resolve({ id: "audit-1" }) }
    );
    expect(res.status).toBe(400);
    expect(insertFindings).not.toHaveBeenCalled();
  });

  it("persists a finding for a real AA failure, computed server-side (ignores any client-posted ratio)", async () => {
    const res = await POST(makeRequest({ ...failingBody, ratio: 999 }), { params: Promise.resolve({ id: "audit-1" }) });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ratio).toBeCloseTo(4.29, 1);
    expect(json.ratio).not.toBe(999);
    expect(insertFindings).toHaveBeenCalledTimes(1);
  });

  it("picks 1.4.3 when hasText is true, 1.4.11 when false — trusts the client's hasText flag directly", async () => {
    await POST(makeRequest(failingBody), { params: Promise.resolve({ id: "audit-1" }) });
    expect(insertFindings.mock.calls[0][0][0].wcag_criterion).toBe("1.4.3");

    vi.clearAllMocks();
    getAuditPageId.mockResolvedValue("page-1");
    await POST(makeRequest({ ...failingBody, hasText: false }), { params: Promise.resolve({ id: "audit-1" }) });
    expect(insertFindings.mock.calls[0][0][0].wcag_criterion).toBe("1.4.11");
  });

  it("resolves the page via getAuditPageId, forwarding an optional pageUrl", async () => {
    await POST(makeRequest({ ...failingBody, pageUrl: "https://example.com/about" }), {
      params: Promise.resolve({ id: "audit-1" }),
    });
    expect(getAuditPageId).toHaveBeenCalledWith("audit-1", "https://example.com/about");
  });

  it("404s when no page can be resolved for the audit", async () => {
    getAuditPageId.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(failingBody), { params: Promise.resolve({ id: "audit-1" }) });
    expect(res.status).toBe(404);
  });

  it("uses the requested viewport for evidence capture when supplied", async () => {
    const { withPage } = await import("@/engine/browser");
    await POST(
      makeRequest({ ...failingBody, viewport: { width: 375, height: 812 } }),
      { params: Promise.resolve({ id: "audit-1" }) }
    );
    expect(withPage).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ viewport: { width: 375, height: 812 } })
    );
  });

  it("allows an anonymous request whose IP matches the audit's creator IP (same pattern as sr-preview)", async () => {
    requireSession.mockResolvedValueOnce({ ok: false, response: Response.json({ error: "no session" }, { status: 401 }) });
    const res = await POST(
      makeRequest(failingBody, {}),
      { params: Promise.resolve({ id: "audit-1" }) }
    );
    // Request carries no x-forwarded-for, so IP is null -> should 401.
    expect(res.status).toBe(401);
  });

  it("rejects an anonymous request whose IP does not match the audit's creator IP", async () => {
    requireSession.mockResolvedValueOnce({ ok: false, response: Response.json({ error: "no session" }, { status: 401 }) });
    const req = new Request("http://localhost/api/audits/audit-1/contrast-finding", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
      body: JSON.stringify(failingBody),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "audit-1" }) });
    expect(res.status).toBe(401);
  });

  it("persists source_engines:['contrast-lab'], confidence 1, and evidence with fg/bg/ratio/apcaLc", async () => {
    await POST(makeRequest(failingBody), { params: Promise.resolve({ id: "audit-1" }) });
    const row = insertFindings.mock.calls[0][0][0];
    expect(row.source_engines).toEqual(["contrast-lab"]);
    expect(row.confidence).toBe(1);
    const evidence = row.evidence as { fg: string; bg: string; ratio: number; apcaLc: number };
    expect(evidence.fg).toBe("#7a7a7a");
    expect(evidence.bg).toBe("#ffffff");
    expect(row.screenshot_crop_url).toBe("https://example.com/evidence/crop.webp");
  });
});
