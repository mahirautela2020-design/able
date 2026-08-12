import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeyboardReplay } from "@/components/workbench/explore/keyboard-replay";
import type { KeyboardStep } from "@/lib/explore/types";

const steps: KeyboardStep[] = [
  { selector: "#cta", label: "Subscribe", bbox: { x: 0, y: 0, width: 100, height: 40 } },
  { selector: "#search", label: "Search", bbox: { x: 0, y: 60, width: 200, height: 30 } },
];

function renderReplay(overrides: Partial<React.ComponentProps<typeof KeyboardReplay>> = {}) {
  return render(
    <KeyboardReplay
      steps={steps}
      current={0}
      playing={false}
      focusTrap={false}
      missingFocusStyle={false}
      tabOrderMismatch={false}
      onPlayPause={() => {}}
      onStep={() => {}}
      {...overrides}
    />
  );
}

describe("KeyboardReplay", () => {
  it("renders a numbered step for every focusable", () => {
    renderReplay();
    expect(screen.getByTestId("keyboard-step-0")).toBeInTheDocument();
    expect(screen.getByTestId("keyboard-step-1")).toBeInTheDocument();
    expect(screen.getByText("Subscribe")).toBeInTheDocument();
  });

  it("play button calls onPlayPause", () => {
    const onPlayPause = vi.fn();
    renderReplay({ onPlayPause });
    fireEvent.click(screen.getByText("Play"));
    expect(onPlayPause).toHaveBeenCalled();
  });

  it("shows Pause when playing", () => {
    renderReplay({ playing: true });
    expect(screen.getByText("Pause")).toBeInTheDocument();
  });

  it("clicking a step calls onStep with its index", () => {
    const onStep = vi.fn();
    renderReplay({ onStep });
    fireEvent.click(screen.getByTestId("keyboard-step-1"));
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("renders flags when set", () => {
    renderReplay({ focusTrap: true, missingFocusStyle: true, tabOrderMismatch: true });
    expect(screen.getByText("Focus trap")).toBeInTheDocument();
    expect(screen.getByText("Missing focus style")).toBeInTheDocument();
    expect(screen.getByText("Tab-order mismatch")).toBeInTheDocument();
  });
});
