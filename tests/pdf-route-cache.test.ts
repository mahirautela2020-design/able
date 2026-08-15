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

const { getAudit, downloadEvidence, uploadEvidence } = vi.hoisted(() => ({
  getAudit: vi.fn<(id: string) => Promise<AuditRow>>(),
  downloadEvidence: vi.fn<(path: string) => Promise<Buffer | null>>(),
  uploadEvidence: vi.fn<(buf: Buffer, path: string, contentType?: string) => Promise<string>>(async () => "signed"),
}));

vi.mock("@/lib/supabase/server", () => ({
  getAudit,
  downloadEvidence,
  uploadEvidence,
  createSignedUrl: vi.fn(async (path: string) => `https://signed.example.com/${path}`),
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

const launchMock = vi.fn(async () => ({
  newPage: async () => ({
    setViewportSize: async () => {},
    setContent: async () => {},
    pdf: async () => Buffer.from("fresh-pdf-bytes"),
  }),
  close: async () => {},
}));
vi.mock("playwright-core", () => ({ chromium: { launch: launchMock } }));
vi.mock("@sparticuz/chromium", () => ({
  default: { args: [], executablePath: async () => "/fake/chromium" },
}));

import { GET as pdfGet } from "@/app/api/audits/[id]/pdf/route";

beforeEach(() => {
  getAudit.mockImplementation(async (id: string) => ({ ...auditRow, id }));
});

afterEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ ok: true, userId: "user-1" });
});

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`);
}

describe("pdf route — caching (regression: every download re-launched headless Chromium for a completed audit whose findings can never change, wasting a full browser render on an identical result)", () => {
  it("serves the cached PDF directly and never launches Chromium, when a cache hit exists for a complete audit", async () => {
    downloadEvidence.mockResolvedValueOnce(Buffer.from("cached-pdf-bytes"));

    const res = await pdfGet(makeRequest("/api/audits/audit-1/pdf"), {
      params: Promise.resolve({ id: "audit-1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(new TextDecoder().decode(await res.arrayBuffer())).toBe("cached-pdf-bytes");
    expect(launchMock).not.toHaveBeenCalled();
    expect(downloadEvidence).toHaveBeenCalledWith("audit-1/report-audit-1.pdf");
  });

  it("generates fresh on a cache miss, then uploads the result for next time", async () => {
    downloadEvidence.mockResolvedValueOnce(null);

    const res = await pdfGet(makeRequest("/api/audits/audit-1/pdf"), {
      params: Promise.resolve({ id: "audit-1" }),
    });

    expect(res.status).toBe(200);
    expect(launchMock).toHaveBeenCalled();
    expect(new TextDecoder().decode(await res.arrayBuffer())).toBe("fresh-pdf-bytes");
    // Best-effort cache write happens fire-and-forget — flush microtasks.
    await new Promise((r) => setTimeout(r, 0));
    expect(uploadEvidence).toHaveBeenCalledWith(
      expect.anything(),
      "audit-1/report-audit-1.pdf",
      "application/pdf"
    );
  });

  it("never checks or writes the cache for an audit that isn't complete yet — its findings can still change", async () => {
    getAudit.mockImplementation(async (id: string) => ({ ...auditRow, id, status: "running" }));

    const res = await pdfGet(makeRequest("/api/audits/audit-1/pdf"), {
      params: Promise.resolve({ id: "audit-1" }),
    });

    expect(res.status).toBe(200);
    expect(downloadEvidence).not.toHaveBeenCalled();
    expect(launchMock).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(uploadEvidence).not.toHaveBeenCalled();
  });
});
