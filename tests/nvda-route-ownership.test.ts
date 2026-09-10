import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/audits/[id]/nvda triggers a real local NVDA run against
// audit.target_url and returns the transcript, gated only by
// requireSession (any valid session) with no ownership check at all --
// same bug class as report/pdf/sr-preview/cancel/contrast-finding, just
// unfixed until now. Not reproduced against a real NVDA run here (that
// needs Windows + NVDA installed); this only proves the ownership gate
// itself, using detectNvda's "unavailable" short-circuit that every
// non-Windows/serverless deployment already takes.
const { getAudit } = vi.hoisted(() => ({
  getAudit: vi.fn(async () => ({
    id: "a1",
    target_url: "https://victim-internal.example.com",
    created_by: "victim-user",
    created_ip: "9.9.9.9",
  })),
}));
vi.mock("@/lib/supabase/server", () => ({ getAudit }));

const { requireSession } = vi.hoisted(() => ({
  requireSession: vi.fn(async () => ({ ok: true as const, userId: "attacker" })),
}));
vi.mock("@/lib/supabase/session", () => ({ requireSession }));

const { getClientIp } = vi.hoisted(() => ({ getClientIp: vi.fn(() => "1.2.3.4") }));
vi.mock("@/lib/http", () => ({ getClientIp }));

const { detectNvda } = vi.hoisted(() => ({
  detectNvda: vi.fn<() => { available: boolean; path: string | null; reason: string | null }>(
    () => ({ available: false, path: null, reason: "not on this platform" })
  ),
}));
vi.mock("@/lib/sr/nvda-driver", () => ({ detectNvda, NvdaDriver: class {} }));

const { withPage } = vi.hoisted(() => ({ withPage: vi.fn() }));
vi.mock("@/engine/browser", () => ({ withPage }));

import { POST } from "@/app/api/audits/[id]/nvda/route";

function req() {
  return new Request("http://localhost/api/audits/a1/nvda", { method: "POST" });
}

beforeEach(() => {
  requireSession.mockResolvedValue({ ok: true, userId: "attacker" });
  getClientIp.mockReturnValue("1.2.3.4");
  detectNvda.mockReturnValue({ available: false, path: null, reason: "not on this platform" });
  withPage.mockClear();
});

describe("POST /api/audits/[id]/nvda -- ownership", () => {
  it("returns available:false before ever reaching the ownership check when NVDA itself is unavailable", async () => {
    // Matches every non-Windows deployment: the cheap availability check
    // short-circuits first, so an unowned caller never learns anything
    // about the audit at all in that (the common) case.
    const res = await POST(req(), { params: Promise.resolve({ id: "a1" }) });
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(getAudit).not.toHaveBeenCalled();
  });

  it("403s a non-owner before ever launching a browser, when NVDA is available", async () => {
    detectNvda.mockReturnValue({ available: true, path: "C:\\NVDA\\nvda.exe", reason: null });

    const res = await POST(req(), { params: Promise.resolve({ id: "a1" }) });

    expect(res.status).toBe(403);
    expect(withPage).not.toHaveBeenCalled();
  });
});
