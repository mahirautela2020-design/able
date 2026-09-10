import { describe, it, expect, vi, beforeEach } from "vitest";

// Reproduces a cross-user isolation gap in POST /api/audits/[id]/cancel:
// unlike DELETE /api/audits (src/app/api/audits/route.ts) and
// getRecentAudits (src/lib/supabase/server.ts), which both require an EXACT
// created_by match for an owned audit and never fall back to IP once
// created_by is set, the cancel route's isOwner check switches on `auth.ok`
// FIRST instead of on `auditRow.created_by` first:
//
//   const isOwner = auth.ok
//     ? auditRow.created_by ? auditRow.created_by === auth.userId : ip-match
//     : ip-match;                                    // <-- no created_by gate
//
// So when the caller is NOT authenticated (no/invalid/expired Bearer token),
// the code falls straight to an IP match — even if the audit IS owned by a
// signed-in user. Any anonymous request whose IP happens to equal the
// audit's created_ip (shared office/VPN/CGNAT network, or a spoofable
// X-Forwarded-For — see src/lib/http.ts getClientIp) can cancel a stranger's
// in-progress audit with zero authentication.
const { getAudit, updateAuditStatus } = vi.hoisted(() => ({
  getAudit: vi.fn(),
  updateAuditStatus: vi.fn(async () => {}),
}));
vi.mock("@/lib/supabase/server", () => ({ getAudit, updateAuditStatus }));

const { requireSession } = vi.hoisted(() => ({
  requireSession: vi.fn(async () => ({
    ok: false,
    response: Response.json({ error: "Missing or invalid authorization header" }, { status: 401 }),
  })),
}));
vi.mock("@/lib/supabase/session", () => ({ requireSession }));
vi.mock("@/lib/http", () => ({ getClientIp: () => "1.2.3.4" }));

import { POST } from "@/app/api/audits/[id]/cancel/route";

// An audit OWNED by a signed-in user (created_by set) whose created_ip
// happens to match the shared/spoofed IP the attacker's request carries.
const ownedAudit = {
  id: "a1",
  target_url: "https://victim-internal.example.com",
  status: "running",
  created_by: "victim-user-id",
  created_ip: "1.2.3.4",
  error_code: null,
};

beforeEach(() => {
  getAudit.mockResolvedValue({ ...ownedAudit });
  requireSession.mockResolvedValue({
    ok: false,
    response: Response.json({ error: "Missing or invalid authorization header" }, { status: 401 }),
  });
  updateAuditStatus.mockClear();
});

function req() {
  // No Authorization header at all -- an anonymous/unauthenticated caller.
  return new Request("http://localhost/api/audits/a1/cancel", { method: "POST" });
}

describe("POST /api/audits/[id]/cancel -- owned audit vs. anonymous same-IP caller", () => {
  it("must NOT let an unauthenticated caller cancel an audit owned by someone else, even from the same IP", async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: "a1" }) });

    // Correct behavior (matches DELETE /api/audits and getRecentAudits):
    // an owned audit requires an authenticated created_by match; falling
    // back to IP is only valid when created_by is null.
    expect(res.status).toBe(401);
    expect(updateAuditStatus).not.toHaveBeenCalled();
  });
});
