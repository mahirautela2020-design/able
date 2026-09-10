import { describe, it, expect, vi, beforeEach } from "vitest";

// src/app/workbench/[auditId]/page.tsx is the server-rendered page every
// user lands on after creating an audit. It used to fetch getAudit +
// getFindingsForAudit directly and render full findings + SIGNED evidence
// URLs with NO identity check of any kind -- anyone with the auditId got
// everything, regardless of ownership.
//
// The fix has a real constraint behind it: this app's Supabase session
// lives in the browser's localStorage (src/lib/supabase/client.ts), not a
// cookie, so a Server Component's top-level page render has no
// Authorization header to check -- there is no way to prove server-side
// that this particular request is the owner's. So: an anonymous audit
// (created_by null) whose IP matches its creator can still be safely
// SSR'd in full (the common "just created it, no account" case, unchanged
// from before). An OWNED audit can never be proven server-side, so its
// target_url/findings/evidence are withheld from the initial render
// entirely -- the client then hydrates immediately via the ALREADY
// owner-scoped GET /api/audits/[id]/report (see workbench.tsx's poll
// effect, which now fires once on mount regardless of audit status).
const { getAudit, getFindingsForAudit, createSignedUrl } = vi.hoisted(() => ({
  getAudit: vi.fn(),
  getFindingsForAudit: vi.fn(async () => [
    {
      id: "f1",
      bucket: "automated",
      rule_id: "color-contrast",
      rule_title: "Insufficient color contrast",
      wcag_criterion: "1.4.3",
      wcag_level: "AA",
      principle: "Perceivable",
      severity: "serious",
      selector: "#password-field-label",
      failure_summary: "Confidential internal admin panel finding",
      screenshot_crop_url: "evidence/victim-audit/crop.webp",
      full_screenshot_url: "evidence/victim-audit/full.webp",
    },
  ]),
  createSignedUrl: vi.fn(async (path: string) => `https://signed.example.com/${path}`),
}));
vi.mock("@/lib/supabase/server", () => ({ getAudit, getFindingsForAudit, createSignedUrl }));

vi.mock("@/components/workbench/workbench", () => ({
  Workbench: (props: Record<string, unknown>) => {
    (globalThis as Record<string, unknown>).__workbenchProps = props;
    return null;
  },
}));

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));
vi.mock("next/headers", () => ({ headers: headersMock }));

import WorkbenchPage from "@/app/workbench/[auditId]/page";

function requesterHeaders(xff: string | null) {
  return { get: (key: string) => (key === "x-forwarded-for" ? xff : null) };
}

async function renderProps(auditId = "an-audit") {
  const element = await WorkbenchPage({ params: Promise.resolve({ auditId }) });
  const { renderToStaticMarkup } = await import("react-dom/server");
  renderToStaticMarkup(element as React.ReactElement);
  return (globalThis as Record<string, unknown>).__workbenchProps as
    | Record<string, unknown>
    | undefined;
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).__workbenchProps = undefined;
  getAudit.mockReset();
  headersMock.mockReset();
});

describe("workbench/[auditId] server page -- ownership check", () => {
  it("must NOT render another user's target_url/findings/evidence when ownership can't be proven server-side", async () => {
    getAudit.mockResolvedValue({
      id: "victim-audit-id",
      target_url: "https://victim-internal-staging.example.com/admin",
      status: "complete",
      config: {},
      platform: "web",
      created_by: "victim-user-id",
      created_ip: "203.0.113.9",
    });
    headersMock.mockResolvedValue(requesterHeaders("198.51.100.1")); // not the creator's IP

    const props = await renderProps("victim-audit-id");

    expect(props).toBeDefined();
    // Workbench still renders (so the shell/loading UI shows and the
    // client-side hydration fetch can run) but with nothing sensitive.
    expect(props?.targetUrl).toBe("");
    expect(props?.findings).toEqual([]);
    // getFindingsForAudit / createSignedUrl must never even be called for
    // an unproven caller -- the leak was as much "we fetched it at all" as
    // "we rendered it".
    expect(getFindingsForAudit).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("also withholds data for an OWNED audit even when the caller's IP happens to match the creator's", async () => {
    // The old bug class fixed everywhere else in this pass: IP alone must
    // never be enough to prove ownership of an OWNED (created_by set) row.
    getAudit.mockResolvedValue({
      id: "victim-audit-id",
      target_url: "https://victim-internal-staging.example.com/admin",
      status: "complete",
      config: {},
      platform: "web",
      created_by: "victim-user-id",
      created_ip: "203.0.113.9",
    });
    headersMock.mockResolvedValue(requesterHeaders("203.0.113.9")); // matches created_ip

    const props = await renderProps("victim-audit-id");

    expect(props?.targetUrl).toBe("");
    expect(props?.findings).toEqual([]);
  });

  it("still fully server-renders an ANONYMOUS audit when the requester's IP matches (unchanged common case)", async () => {
    getAudit.mockResolvedValue({
      id: "my-audit-id",
      target_url: "https://example.com",
      status: "complete",
      config: {},
      platform: "web",
      created_by: null,
      created_ip: "203.0.113.9",
    });
    headersMock.mockResolvedValue(requesterHeaders("203.0.113.9"));

    const props = await renderProps("my-audit-id");

    expect(props?.targetUrl).toBe("https://example.com");
    expect((props?.findings as unknown[])?.length).toBe(1);
    expect(getFindingsForAudit).toHaveBeenCalledWith("my-audit-id");
  });

  it("withholds data for an anonymous audit when the requester's IP does not match", async () => {
    getAudit.mockResolvedValue({
      id: "someone-elses-anon-audit",
      target_url: "https://example.com",
      status: "complete",
      config: {},
      platform: "web",
      created_by: null,
      created_ip: "203.0.113.9",
    });
    headersMock.mockResolvedValue(requesterHeaders("198.51.100.1"));

    const props = await renderProps("someone-elses-anon-audit");

    expect(props?.targetUrl).toBe("");
    expect(props?.findings).toEqual([]);
  });
});
