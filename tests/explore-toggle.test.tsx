import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ViewExploreToggle } from "@/components/workbench/explore-workbench";

describe("ViewExploreToggle", () => {
  it("renders both modes", () => {
    render(<ViewExploreToggle mode="view" onChange={() => {}} />);
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByText("Explore")).toBeInTheDocument();
  });

  it("switching to Explore calls onChange('explore')", () => {
    const onChange = vi.fn();
    render(<ViewExploreToggle mode="view" onChange={onChange} />);
    fireEvent.click(screen.getByText("Explore"));
    expect(onChange).toHaveBeenCalledWith("explore");
  });

  it("switching to View calls onChange('view')", () => {
    const onChange = vi.fn();
    render(<ViewExploreToggle mode="explore" onChange={onChange} />);
    fireEvent.click(screen.getByText("View"));
    expect(onChange).toHaveBeenCalledWith("view");
  });

  it("reflects the selected mode via aria-selected", () => {
    render(<ViewExploreToggle mode="explore" onChange={() => {}} />);
    expect(screen.getByText("Explore")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("View")).toHaveAttribute("aria-selected", "false");
  });
});
