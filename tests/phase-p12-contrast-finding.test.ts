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

const { sanitizeUrl, validateHost } = vi.hoisted(() => ({
  sanitizeUrl: vi.fn((raw: string) => {
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url;
    } catch {
      return null;
    }
  }),
  validateHost: vi.fn(async (hostname: string) => {
    if (
      hostname === "169.254.169.254" ||
      hostname === "localhost" ||
      hostname === "metadata.google.internal" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.")
    ) {
      throw new Error(`SSRF_BLOCKED: ${hostname}`);
    }
  }),
}));
vi.mock("@/lib/ssrf", () => ({ sanitizeUrl, validateHost }));

const fakePage = {
  goto: vi.fn(async () => {}),
  screenshot: vi.fn(async () => Buffer.from("fake-screenshot")),
  // Default: agrees with the client-posted hasText in `failingBody` (true)
  // so existing tests are unaffected; individual tests override this to
  // exercise the server-side verification.
  evaluate: vi.fn(async () => true),
};

vi.mock("@/engine/browser", () => ({
  withPage: vi.fn(async (fn: (page: unknown) => Promise<unknown>) => fn(fakePage)),
}));

vi.mock("sharp", () => {
  const chain = {
    metadata: vi.fn(async () => ({ width: 1440, height: 3200 })),
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

  it("regression: an AAA-only failure (passes AA, fails AAA) is rejected at the default AA target but accepted when the caller selects AAA", async () => {
    // #636363 on white is ~6.01:1 — passes the 4.5:1 AA floor but misses the
    // 7:1 AAA floor. Before this fix, the route's gate always checked AA
    // regardless of what the caller sent, so this pair could never be
    // flagged no matter what the UI had selected.
    const aaaFailingBody = { ...failingBody, fg: "#636363", bg: "#ffffff" };

    const atAa = await POST(makeRequest(aaaFailingBody), { params: Promise.resolve({ id: "audit-1" }) });
    expect(atAa.status).toBe(400);
    expect(insertFindings).not.toHaveBeenCalled();

    const atAaa = await POST(
      makeRequest({ ...aaaFailingBody, level: "AAA" }),
      { params: Promise.resolve({ id: "audit-1" }) }
    );
    expect(atAaa.status).toBe(201);
    const json = await atAaa.json();
    expect(json.criterion).toBe("1.4.6");
    expect(insertFindings).toHaveBeenCalledTimes(1);
    expect(insertFindings.mock.calls[0][0][0].wcag_level).toBe("AAA");
  });

  it("picks 1.4.3 when hasText is true, 1.4.11 when false — server-verified against the live DOM, agreeing with the client here", async () => {
    fakePage.evaluate.mockResolvedValueOnce(true);
    await POST(makeRequest(failingBody), { params: Promise.resolve({ id: "audit-1" }) });
    expect(insertFindings.mock.calls[0][0][0].wcag_criterion).toBe("1.4.3");

    vi.clearAllMocks();
    getAuditPageId.mockResolvedValue("page-1");
    fakePage.evaluate.mockResolvedValueOnce(false);
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

  describe("SSRF guard (regression: pageUrl was navigated with no host validation)", () => {
    it("blocks a private/internal pageUrl and never navigates or persists a finding", async () => {
      const res = await POST(
        makeRequest({ ...failingBody, pageUrl: "http://169.254.169.254/latest/meta-data/" }),
        { params: Promise.resolve({ id: "audit-1" }) }
      );
      expect(res.status).toBe(400);
      const { withPage } = await import("@/engine/browser");
      expect(withPage).not.toHaveBeenCalled();
      expect(insertFindings).not.toHaveBeenCalled();
      expect(validateHost).toHaveBeenCalledWith("169.254.169.254");
    });

    it("blocks localhost", async () => {
      const res = await POST(
        makeRequest({ ...failingBody, pageUrl: "http://localhost:8080/admin" }),
        { params: Promise.resolve({ id: "audit-1" }) }
      );
      expect(res.status).toBe(400);
      expect(insertFindings).not.toHaveBeenCalled();
    });

    it("allows a normal public https pageUrl through validateHost", async () => {
      const res = await POST(
        makeRequest({ ...failingBody, pageUrl: "https://example.com/about" }),
        { params: Promise.resolve({ id: "audit-1" }) }
      );
      expect(res.status).toBe(201);
      expect(validateHost).toHaveBeenCalledWith("example.com");
    });

    it("rejects a relative/non-http pageUrl instead of attempting navigation (closes the demo-fixture data-corruption path)", async () => {
      const res = await POST(
        makeRequest({ ...failingBody, pageUrl: "/explore-demo.html" }),
        { params: Promise.resolve({ id: "audit-1" }) }
      );
      expect(res.status).toBe(400);
      expect(insertFindings).not.toHaveBeenCalled();
    });
  });

  describe("evidence screenshot (regression: was viewport-only, dropped fullPage capture)", () => {
    it("captures the full scrollable page, not just the viewport, so below-the-fold crops are correct", async () => {
      await POST(makeRequest(failingBody), { params: Promise.resolve({ id: "audit-1" }) });
      expect(fakePage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: true, animations: "disabled" })
      );
    });

    it("clamps the crop against the real captured image dimensions (read back via sharp), not just the requested viewport", async () => {
      await POST(
        makeRequest({ ...failingBody, bbox: { x: 10, y: 2900, width: 50, height: 20 } }),
        { params: Promise.resolve({ id: "audit-1" }) }
      );
      const sharpModule = (await import("sharp")).default as unknown as (
        buf: Buffer
      ) => { metadata: () => Promise<unknown> };
      expect(sharpModule).toHaveBeenCalled();
      // A finding is still persisted with real crop evidence for a bbox well
      // below the default 900px viewport height — proves the crop bounds
      // came from the real (taller) captured image, not the viewport size.
      const row = insertFindings.mock.calls[0][0][0];
      expect(row.screenshot_crop_url).toBe("https://example.com/evidence/crop.webp");
    });
  });

  describe("auth ordering (regression: audit-existence check ran before auth, enabling ID enumeration)", () => {
    it("gives an unauthenticated caller the SAME response for a missing audit as for a wrong-IP existing audit (no enumeration signal)", async () => {
      requireSession.mockResolvedValue({
        ok: false,
        response: Response.json({ error: "no session" }, { status: 401 }),
      });
      const noAuthReq = (auditId: string) =>
        new Request(`http://localhost/api/audits/${auditId}/contrast-finding`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
          body: JSON.stringify(failingBody),
        });

      const missingRes = await POST(noAuthReq("missing-audit"), {
        params: Promise.resolve({ id: "missing-audit" }),
      });
      const wrongIpRes = await POST(noAuthReq("audit-1"), {
        params: Promise.resolve({ id: "audit-1" }),
      });

      expect(missingRes.status).toBe(401);
      expect(wrongIpRes.status).toBe(401);
    });

    it("still returns 404 for a genuinely missing audit when the caller has a valid session", async () => {
      const res = await POST(makeRequest(failingBody), { params: Promise.resolve({ id: "missing-audit" }) });
      expect(res.status).toBe(404);
    });
  });

  describe("hasText verification (regression: client-posted hasText was trusted with no cross-check)", () => {
    it("overrides a mismatched client hasText with the real DOM textContent check (client lies true, DOM says false)", async () => {
      fakePage.evaluate.mockResolvedValueOnce(false);
      await POST(
        makeRequest({ ...failingBody, hasText: true, selector: "#icon-btn" }),
        { params: Promise.resolve({ id: "audit-1" }) }
      );
      expect(insertFindings.mock.calls[0][0][0].wcag_criterion).toBe("1.4.11");
      expect(fakePage.evaluate).toHaveBeenCalledWith(expect.any(Function), "#icon-btn");
    });

    it("overrides a mismatched client hasText the other direction (client lies false, DOM says true)", async () => {
      fakePage.evaluate.mockResolvedValueOnce(true);
      await POST(
        makeRequest({ ...failingBody, hasText: false }),
        { params: Promise.resolve({ id: "audit-1" }) }
      );
      expect(insertFindings.mock.calls[0][0][0].wcag_criterion).toBe("1.4.3");
    });

    it("falls back to the client-supplied hasText when the live DOM check itself fails (best-effort)", async () => {
      fakePage.evaluate.mockRejectedValueOnce(new Error("selector not found"));
      await POST(
        makeRequest({ ...failingBody, hasText: true }),
        { params: Promise.resolve({ id: "audit-1" }) }
      );
      expect(insertFindings.mock.calls[0][0][0].wcag_criterion).toBe("1.4.3");
    });
  });
});
