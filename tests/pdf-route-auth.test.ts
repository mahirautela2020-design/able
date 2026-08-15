import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

type SessionResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

const { requireSession } = vi.hoisted(() => ({
  requireSession: vi.fn<() => Promise<SessionResult>>(async () => ({ ok: true, userId: "user-1" })),
}));
vi.mock("@/lib/supabase/session", () => ({ requireSession }));

interface AuditRow {
  id: string;
  target_url: string;
  status: string;
  created_at: string;
  created_ip: string | null;
  created_by: string | null;
  report_path: string | null;
  config: Record<string, unknown>;
}

const auditRow: AuditRow = {
  id: "audit-1",
  target_url: "https://example.com/",
  status: "complete",
  created_at: "2026-01-01T00:00:00Z",
  created_ip: "1.2.3.4",
  created_by: "user-1",
  report_path: null,
  config: {},
};

const { getAudit } = vi.hoisted(() => ({
  getAudit: vi.fn<(id: string) => Promise<AuditRow>>(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getAudit,
  createSignedUrl: vi.fn(async (path: string) => `https://signed.example.com/${path}`),
  downloadEvidence: vi.fn(async () => null),
  uploadEvidence: vi.fn(async () => "uploaded"),
  supabase: {
    from: (table: string) => {
      if (table === "audits") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: auditRow, error: null }) }) }) };
      }
      if (table === "findings") {
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

// buildReportHtml never reaches these for the 401 paths this file covers,
// but the module graph still resolves them at import time.
vi.mock("playwright-core", () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newPage: async () => ({
        setViewportSize: async () => {},
        setContent: async () => {},
        pdf: async () => Buffer.from("fake-pdf"),
      }),
      close: async () => {},
    })),
  },
}));
vi.mock("@sparticuz/chromium", () => ({
  default: { args: [], executablePath: async () => "/fake/chromium" },
}));

import { GET as pdfGet } from "@/app/api/audits/[id]/pdf/route";

beforeEach(() => {
  getAudit.mockImplementation(async (id: string) => {
    if (id === "missing-audit") throw new Error("not found");
    return { ...auditRow, id };
  });
});

afterEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ ok: true, userId: "user-1" });
});

function makeRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

describe("pdf route — owner-scoped auth (regression: any valid session could download any audit's PDF)", () => {
  it("401s for a missing audit", async () => {
    const res = await pdfGet(makeRequest("/api/audits/missing-audit/pdf"), {
      params: Promise.resolve({ id: "missing-audit" }),
    });
    expect(res.status).toBe(401);
  });

  it("401s an authenticated session that does NOT own the audit (the exact bug: previously any valid session passed)", async () => {
    requireSession.mockResolvedValue({ ok: true, userId: "someone-else" });
    const res = await pdfGet(makeRequest("/api/audits/audit-1/pdf"), {
      params: Promise.resolve({ id: "audit-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("allows the owning session through to PDF generation", async () => {
    const res = await pdfGet(makeRequest("/api/audits/audit-1/pdf"), {
      params: Promise.resolve({ id: "audit-1" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("rejects an anonymous caller whose IP does not match the audit's creator IP", async () => {
    requireSession.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "no session" }, { status: 401 }),
    });
    const res = await pdfGet(
      makeRequest("/api/audits/audit-1/pdf", { "x-forwarded-for": "9.9.9.9" }),
      { params: Promise.resolve({ id: "audit-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("allows an anonymous caller whose IP matches an anonymous (created_by: null) audit's creator IP", async () => {
    getAudit.mockResolvedValueOnce({ ...auditRow, created_by: null });
    requireSession.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "no session" }, { status: 401 }),
    });
    const res = await pdfGet(
      makeRequest("/api/audits/audit-1/pdf", { "x-forwarded-for": "1.2.3.4" }),
      { params: Promise.resolve({ id: "audit-1" }) }
    );
    expect(res.status).toBe(200);
  });
});
