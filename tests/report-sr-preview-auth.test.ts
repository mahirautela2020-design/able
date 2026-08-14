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
  created_ip: string | null;
  created_by: string | null;
  report_path: string | null;
}

const { getAudit, getFindingsForAudit, createSignedUrl } = vi.hoisted(() => ({
  getAudit: vi.fn<(id: string) => Promise<AuditRow>>(async (id: string) => {
    if (id === "missing-audit") throw new Error("not found");
    return {
      id,
      target_url: "https://example.com/",
      status: "complete",
      created_ip: "1.2.3.4",
      created_by: "user-1",
      report_path: null,
    };
  }),
  getFindingsForAudit: vi.fn(async () => []),
  createSignedUrl: vi.fn(async (path: string) => `https://signed.example.com/${path}`),
}));

vi.mock("@/lib/supabase/server", () => ({
  getAudit,
  getFindingsForAudit,
  createSignedUrl,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({ data: null, error: new Error("not found") })),
      })),
    },
  })),
}));

import { GET as reportGet } from "@/app/api/audits/[id]/report/route";
import { GET as srPreviewGet } from "@/app/api/audits/[id]/sr-preview/route";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});

afterEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ ok: true, userId: "user-1" });
});

function makeRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

describe.each([
  { name: "report", handler: reportGet },
  { name: "sr-preview", handler: srPreviewGet },
])("$name route — owner-scoped auth (regression: any valid session bypassed ownership)", ({ handler }) => {
  it("401s for a missing audit", async () => {
    const res = await handler(makeRequest("/api/audits/missing-audit"), {
      params: Promise.resolve({ id: "missing-audit" }),
    });
    expect(res.status).toBe(401);
  });

  it("regression: an authenticated session that does NOT own the audit is rejected (previously any valid session passed)", async () => {
    requireSession.mockResolvedValue({ ok: true, userId: "someone-else" });
    const res = await handler(makeRequest("/api/audits/audit-1"), {
      params: Promise.resolve({ id: "audit-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("allows the owning session", async () => {
    const res = await handler(makeRequest("/api/audits/audit-1"), {
      params: Promise.resolve({ id: "audit-1" }),
    });
    expect(res.status).toBe(200);
  });

  it("allows an anonymous caller whose IP matches an anonymous (created_by: null) audit's creator IP", async () => {
    getAudit.mockResolvedValueOnce({
      id: "audit-1",
      target_url: "https://example.com/",
      status: "complete",
      created_ip: "1.2.3.4",
      created_by: null,
      report_path: null,
    });
    requireSession.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "no session" }, { status: 401 }),
    });
    const res = await handler(
      makeRequest("/api/audits/audit-1", { "x-forwarded-for": "1.2.3.4" }),
      { params: Promise.resolve({ id: "audit-1" }) }
    );
    expect(res.status).toBe(200);
  });

  it("rejects an anonymous caller whose IP does not match", async () => {
    requireSession.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "no session" }, { status: 401 }),
    });
    const res = await handler(
      makeRequest("/api/audits/audit-1", { "x-forwarded-for": "9.9.9.9" }),
      { params: Promise.resolve({ id: "audit-1" }) }
    );
    expect(res.status).toBe(401);
  });
});
