import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccessibilityOptionsPanel } from "@/components/workbench/explore/accessibility-options";

afterEach(() => {
  vi.restoreAllMocks();
});

function setup() {
  const onApply = vi.fn();
  const onOrientationChange = vi.fn();
  render(
    <AccessibilityOptionsPanel
      onApply={onApply}
      orientation="landscape"
      onOrientationChange={onOrientationChange}
    />
  );
  return { onApply, onOrientationChange };
}

describe("AccessibilityOptionsPanel", () => {
  it("applies the default profile settings on mount", () => {
    const { onApply } = setup();
    expect(onApply).toHaveBeenCalledWith({ filter: "none", textScale: 100, reducedMotion: false });
  });

  it("the panel is closed until the FAB is clicked", () => {
    setup();
    expect(screen.queryByTestId("a11y-options-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("a11y-options-fab"));
    expect(screen.getByTestId("a11y-options-panel")).toBeInTheDocument();
  });

  it("Ctrl+F2 toggles the panel open and closed", () => {
    setup();
    expect(screen.queryByTestId("a11y-options-panel")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "F2", ctrlKey: true });
    expect(screen.getByTestId("a11y-options-panel")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "F2", ctrlKey: true });
    expect(screen.queryByTestId("a11y-options-panel")).not.toBeInTheDocument();
  });

  it("selecting the 'Low Vision' profile applies its bundled settings in one call", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByTestId("a11y-options-fab"));
    onApply.mockClear();

    fireEvent.click(screen.getByTestId("a11y-profile-low-vision"));

    expect(onApply).toHaveBeenCalledWith({
      filter: "contrast(1.3)",
      textScale: 150,
      reducedMotion: false,
    });
  });

  it("changing the color filter dropdown applies only the filter, keeping other settings", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByTestId("a11y-options-fab"));
    fireEvent.click(screen.getByTestId("a11y-text-scale-125"));
    onApply.mockClear();

    fireEvent.change(screen.getByTestId("a11y-filter-select"), {
      target: { value: "grayscale(1)" },
    });

    expect(onApply).toHaveBeenCalledWith({ filter: "grayscale(1)", textScale: 125, reducedMotion: false });
  });

  it("toggling 'Reduce motion' flips only that flag", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByTestId("a11y-options-fab"));
    onApply.mockClear();

    fireEvent.click(screen.getByTestId("a11y-reduced-motion"));

    expect(onApply).toHaveBeenCalledWith({ filter: "none", textScale: 100, reducedMotion: true });
  });

  it("clicking a text-size button reports the new scale, keeping filter/motion unchanged", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByTestId("a11y-options-fab"));
    onApply.mockClear();

    fireEvent.click(screen.getByTestId("a11y-text-scale-150"));

    expect(onApply).toHaveBeenCalledWith({ filter: "none", textScale: 150, reducedMotion: false });
  });

  it("clicking an orientation button calls onOrientationChange, not onApply (orientation is handled by the parent's iframe container, not the bridge)", () => {
    const { onApply, onOrientationChange } = setup();
    fireEvent.click(screen.getByTestId("a11y-options-fab"));
    onApply.mockClear();

    fireEvent.click(screen.getByTestId("a11y-orientation-portrait"));

    expect(onOrientationChange).toHaveBeenCalledWith("portrait");
    expect(onApply).not.toHaveBeenCalled();
  });
});
