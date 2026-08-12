import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CvdOverlay } from "@/components/workbench/explore/cvd-overlay";
import type { CvdFlag } from "@/lib/cvd";

describe("CvdOverlay", () => {
  it("selecting a type calls onChange", () => {
    const onChange = vi.fn();
    render(<CvdOverlay type={null} flags={[]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("cvd-select"), { target: { value: "deuteranopia" } });
    expect(onChange).toHaveBeenCalledWith("deuteranopia");
  });

  it("selecting none calls onChange(null)", () => {
    const onChange = vi.fn();
    render(<CvdOverlay type="deuteranopia" flags={[]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("cvd-select"), { target: { value: "none" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("renders flagged pairs when present", () => {
    const flags: CvdFlag[] = [
      { fg: "#000000", bg: "#009900", type: "deuteranopia", normalRatio: 5.56, cvdRatio: 3.01 },
    ];
    render(<CvdOverlay type="deuteranopia" flags={flags} onChange={() => {}} />);
    expect(screen.getByTestId("cvd-flags")).toBeInTheDocument();
    expect(screen.getByText(/5\.56:1 → 3\.01:1/)).toBeInTheDocument();
  });

  it("shows the honest simulated disclaimer when a type is active", () => {
    render(<CvdOverlay type="protanopia" flags={[]} onChange={() => {}} />);
    expect(screen.getByText(/Simulated — verify with real users/)).toBeInTheDocument();
  });
});
