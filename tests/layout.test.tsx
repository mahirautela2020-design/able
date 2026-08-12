import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/workbench/sidebar";

describe("sidebar", () => {
  it("renders nav links: Scope, Findings, AX Snapshots", () => {
    render(<Sidebar auditId="test-audit-id" />);

    expect(screen.getByText("Scope")).toBeInTheDocument();
    expect(screen.getByText("Findings")).toBeInTheDocument();
    expect(screen.getByText("AX Snapshots")).toBeInTheDocument();
  });

  it("renders Able branding", () => {
    render(<Sidebar auditId="test-audit-id" />);

    expect(screen.getByText("Able")).toBeInTheDocument();
    expect(screen.getByText("Accessibility Auditor")).toBeInTheDocument();
  });

  it("links to scope, findings, and snapshots paths", () => {
    render(<Sidebar auditId="abc-123" />);

    const scopeLink = screen.getByText("Scope").closest("a");
    const findingsLink = screen.getByText("Findings").closest("a");
    const snapshotsLink = screen.getByText("AX Snapshots").closest("a");

    expect(scopeLink).toHaveAttribute("href", "/scope/abc-123");
    expect(findingsLink).toHaveAttribute("href", "/scope/abc-123/findings");
    expect(snapshotsLink).toHaveAttribute("href", "/scope/abc-123/snapshots/page-001");
  });
});
