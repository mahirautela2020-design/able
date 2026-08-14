import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Workbench } from "@/components/workbench/workbench";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ blocked: false, snapshot: null }) })
  );
}

describe("Workbench — Contrast Lab toggle (real workbench, not the disconnected fixture route)", () => {
  it("defaults to the live preview iframe", () => {
    stubFetch();
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );
    expect(screen.getByTitle("Live preview of https://example.com")).toBeInTheDocument();
    expect(screen.queryByTitle("Explore preview")).not.toBeInTheDocument();
  });

  it("clicking 'Contrast Lab' swaps the right pane to the real ExplorePanel, wired with the real auditId", () => {
    stubFetch();
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    fireEvent.click(screen.getByText("Contrast Lab"));

    expect(screen.getByTitle("Explore preview")).toBeInTheDocument();
    expect(screen.queryByTitle("Live preview of https://example.com")).not.toBeInTheDocument();
    expect(screen.getByText("Element Inspector")).toBeInTheDocument();
  });

  it("switching back to 'Checklist' mode restores the live iframe", () => {
    stubFetch();
    render(
      <Workbench auditId="audit-1" targetUrl="https://example.com" auditStatus="complete" findings={[]} />
    );

    fireEvent.click(screen.getByText("Contrast Lab"));
    expect(screen.getByTitle("Explore preview")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Checklist"));
    expect(screen.getByTitle("Live preview of https://example.com")).toBeInTheDocument();
  });
});
