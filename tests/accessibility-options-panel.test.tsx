import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  AccessibilityOptionsPanel,
  DEFAULT_A11Y_SETTINGS,
} from "@/components/workbench/explore/accessibility-options";

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
    expect(onApply).toHaveBeenCalledWith(DEFAULT_A11Y_SETTINGS);
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

    fireEvent.click(screen.getByTestId("a11y-preset-low-vision"));

    expect(onApply).toHaveBeenCalledWith({
      ...DEFAULT_A11Y_SETTINGS,
      textScale: 150,
      contrast: "high",
      bigCursor: true,
    });
  });

  it("changing the contrast dropdown applies only that field, keeping other settings", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByTestId("a11y-options-fab"));
    fireEvent.click(screen.getByTestId("a11y-text-scale-125"));
    onApply.mockClear();

    fireEvent.change(screen.getByTestId("a11y-contrast"), {
      target: { value: "high" },
    });

    expect(onApply).toHaveBeenCalledWith({
      ...DEFAULT_A11Y_SETTINGS,
      textScale: 125,
      contrast: "high",
    });
  });

  it("toggling 'Pause animations' flips only the reducedMotion flag", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByTestId("a11y-options-fab"));
    onApply.mockClear();

    fireEvent.click(screen.getByTestId("a11y-reduced-motion"));

    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_A11Y_SETTINGS, reducedMotion: true });
  });

  it("clicking a text-size button reports the new scale, keeping other settings unchanged", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByTestId("a11y-options-fab"));
    onApply.mockClear();

    fireEvent.click(screen.getByTestId("a11y-text-scale-150"));

    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_A11Y_SETTINGS, textScale: 150 });
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
