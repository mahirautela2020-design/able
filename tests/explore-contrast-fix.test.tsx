import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContrastFix } from "@/components/workbench/explore/contrast-fix";
import type { InspectedElement } from "@/lib/explore/types";

const failing: InspectedElement = {
  role: "button",
  name: "Subscribe",
  tag: "button",
  selector: "#cta",
  aria: {},
  fontSize: "16px",
  touchTarget: { width: 120, height: 40 },
  tabIndex: 0,
  ancestors: ["main"],
  bbox: { x: 0, y: 0, width: 120, height: 40 },
  computed: { color: "#7a7a7a", backgroundColor: "#ffffff" },
  hasText: true,
};

describe("ContrastFix", () => {
  it("shows a failing contrast verdict with a fix", () => {
    render(<ContrastFix element={failing} onApply={() => {}} />);
    expect(screen.getByTestId("contrast-verdict")).toHaveTextContent("fails AA");
    expect(screen.getByText(/Suggested fix/)).toBeInTheDocument();
  });

  it("apply fix calls onApply with the selector and a hex color", () => {
    const onApply = vi.fn();
    render(<ContrastFix element={failing} onApply={onApply} />);
    fireEvent.click(screen.getByText("Apply fix"));
    expect(onApply).toHaveBeenCalledWith("#cta", expect.stringMatching(/^#[0-9a-f]{6}$/));
  });

  it("shows a passing verdict for a compliant element", () => {
    const passing: InspectedElement = {
      ...failing,
      computed: { color: "#000000", backgroundColor: "#ffffff" },
    };
    render(<ContrastFix element={passing} onApply={() => {}} />);
    expect(screen.getByTestId("contrast-verdict")).toHaveTextContent("passes");
    expect(screen.queryByText(/Suggested fix/)).not.toBeInTheDocument();
  });

  it("shows empty state when nothing picked", () => {
    render(<ContrastFix element={null} onApply={() => {}} />);
    expect(screen.getByTestId("contrast-fix-empty")).toBeInTheDocument();
  });
});
