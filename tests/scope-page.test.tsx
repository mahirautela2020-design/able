import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ScopeDetailPage from "@/app/(app)/scope/[auditId]/page";

async function renderAsync(element: React.ReactElement) {
  const result = await element;
  return render(result);
}

describe("scope-detail-page", () => {
  it("renders audit target URL and status", async () => {
    const params = Promise.resolve({ auditId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
    await renderAsync(await ScopeDetailPage({ params }));

    const urls = screen.getAllByText("https://example.com");
    expect(urls.length).toBeGreaterThanOrEqual(1);

    const badges = screen.getAllByText("complete");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows scanned page count", async () => {
    const params = Promise.resolve({ auditId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
    await renderAsync(await ScopeDetailPage({ params }));

    expect(screen.getByText("3 pages")).toBeInTheDocument();
  });

  it("shows scanned pages with titles and scores", async () => {
    const params = Promise.resolve({ auditId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
    await renderAsync(await ScopeDetailPage({ params }));

    expect(screen.getByText("Example Homepage")).toBeInTheDocument();
    expect(screen.getByText("75.5%")).toBeInTheDocument();
    expect(screen.getByText("82.0%")).toBeInTheDocument();
    expect(screen.getByText("90.0%")).toBeInTheDocument();
  });

  it("renders created date", async () => {
    const params = Promise.resolve({ auditId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
    await renderAsync(await ScopeDetailPage({ params }));

    expect(screen.getByText(/Audit created/)).toBeInTheDocument();
  });

  it("shows not found for unknown audit ID", async () => {
    const params = Promise.resolve({ auditId: "nonexistent" });
    await renderAsync(await ScopeDetailPage({ params }));

    expect(screen.getByText("Audit not found")).toBeInTheDocument();
  });

  it("links to snapshot pages", async () => {
    const params = Promise.resolve({ auditId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });
    await renderAsync(await ScopeDetailPage({ params }));

    const homeLink = screen.getByText("Example Homepage").closest("a");
    expect(homeLink).toHaveAttribute(
      "href",
      "/scope/a1b2c3d4-e5f6-7890-abcd-ef1234567890/snapshots/page-001"
    );
  });
});
