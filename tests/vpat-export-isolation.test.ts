import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/vpat/export (src/app/api/vpat/export/route.ts) requires a valid
// session (`requireSession`) and then calls `getFindingsForAudit(auditId)`
// for whatever `auditId` query parameter the caller supplies -- it never
// calls `getAudit` to check that auditId belongs to the caller. The route's
// own comment claims the auth guard is the protection ("must not be
// readable without a valid session"), but that's the same flawed reasoning
// found in the APK/IPA upload routes: requiring *a* valid session is not
// the same as requiring THIS audit's owner's session. Any signed-in user
// can export any other user's full findings (rule ids, selectors,
// element_html, failure summaries, evidence) as a VPAT JSON/CSV just by
// knowing or guessing the auditId.
const { requireSession } = vi.hoisted(() => ({
  requireSession: vi.fn(async () => ({ ok: true, userId: "user-b" })),
}));
vi.mock("@/lib/supabase/session", () => ({ requireSession }));

const { getAudit } = vi.hoisted(() => ({
  getAudit: vi.fn(async () => ({
    id: "audit-owned-by-user-a",
    created_by: "user-a",
    created_ip: "9.9.9.9",
  })),
}));
vi.mock("@/lib/http", () => ({ getClientIp: () => "1.2.3.4" }));

const { getFindingsForAudit } = vi.hoisted(() => ({
  getFindingsForAudit: vi.fn(async (auditId: string) => [
    {
      bucket: "automated",
      rule_id: "color-contrast",
      rule_title: "Insufficient color contrast",
      wcag_criteria: ["1.4.3"],
      wcag_criterion: "1.4.3",
      wcag_level: "AA",
      principle: "Perceivable",
      severity: "serious",
      confidence: 1,
      source_engines: ["axe-core"],
      selector: "#login-button",
      element_html: "<button id=\"login-button\">Sign in</button>",
      failure_summary: `Belongs to a different account's audit: ${auditId}`,
      additional_instances: 0,
      evidence: { note: "private evidence belonging to another user" },
      engine_version: "4.10.0",
    },
  ]),
}));
vi.mock("@/lib/supabase/server", () => ({ getFindingsForAudit, getAudit }));

import { GET } from "@/app/api/vpat/export/route";

beforeEach(() => {
  requireSession.mockResolvedValue({ ok: true, userId: "user-b" });
  getAudit.mockReset();
  getAudit.mockResolvedValue({
    id: "audit-owned-by-user-a",
    created_by: "user-a",
    created_ip: "9.9.9.9",
  });
  getFindingsForAudit.mockClear();
});

describe("GET /api/vpat/export -- ownership of the target auditId", () => {
  it("must NOT let an authenticated caller export findings for an audit they don't own", async () => {
    // "audit-owned-by-user-a" belongs to a different account than the
    // caller (user-b, from requireSession above). A correctly-scoped route
    // would reject this (403/404), the same way /api/audits/[id]/report
    // and /api/audits/[id]/pdf reject a non-owning session.
    const request = new Request(
      "http://localhost/api/vpat/export?auditId=audit-owned-by-user-a",
      { headers: { Authorization: "Bearer test-token" } }
    );
    const res = await GET(request);

    expect(res.status).toBe(403);
    // The other user's findings (selectors, element HTML, evidence) must
    // never be read at all for a caller who doesn't own the audit.
    expect(getFindingsForAudit).not.toHaveBeenCalled();
  });

  it("allows the real owner to export their own audit", async () => {
    requireSession.mockResolvedValue({ ok: true, userId: "user-a" });
    const request = new Request(
      "http://localhost/api/vpat/export?auditId=audit-owned-by-user-a",
      { headers: { Authorization: "Bearer test-token" } }
    );
    const res = await GET(request);

    expect(res.status).toBe(200);
    expect(getFindingsForAudit).toHaveBeenCalledWith("audit-owned-by-user-a");
  });
});
