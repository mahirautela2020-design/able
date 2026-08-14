import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const { capturedProps } = vi.hoisted(() => ({ capturedProps: [] as Record<string, unknown>[] }));

vi.mock("@/components/workbench/explore-workbench", () => ({
  ExploreWorkbench: (props: Record<string, unknown>) => {
    capturedProps.push(props);
    return null;
  },
}));

import ExplorePage from "@/app/(app)/scope/[auditId]/explore/page";

async function renderAsync(element: Promise<React.ReactElement>) {
  return render(await element);
}

const FIXTURE_AUDIT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("ExplorePage — auditId must not leak onto the disconnected demo fixture (regression: phantom findings on real audits)", () => {
  it("passes the real auditId through when it matches the bundled fixture (existing behavior)", async () => {
    await renderAsync(ExplorePage({ params: Promise.resolve({ auditId: FIXTURE_AUDIT_ID }) }));
    expect(capturedProps.at(-1)?.auditId).toBe(FIXTURE_AUDIT_ID);
    expect(capturedProps.at(-1)?.targetUrl).toBe("/explore-demo.html");
  });

  it("passes null (not the real auditId) when the route param does not match the fixture", async () => {
    const realAuditId = "6132d64c-bd59-44f1-898a-c850d71256e8"; // a genuinely different, real audit
    await renderAsync(ExplorePage({ params: Promise.resolve({ auditId: realAuditId }) }));
    expect(capturedProps.at(-1)?.auditId).toBeNull();
    // Still shows the demo fixture content, but decoupled from any real audit id.
    expect(capturedProps.at(-1)?.targetUrl).toBe("/explore-demo.html");
  });
});
