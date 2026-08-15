import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VoiceSupport } from "@/components/workbench/explore/voice-support";
import { DEFAULT_A11Y_SETTINGS } from "@/components/workbench/explore/accessibility-options";

class MockRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((ev: unknown) => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
}

let lastInstance: MockRecognition;

function installMockRecognition() {
  lastInstance = new MockRecognition();
  // A plain constructor function (not vi.fn(() => ...), which wraps an
  // arrow function and isn't `new`-able) so `new Ctor()` in the component
  // works exactly like the real SpeechRecognition constructor.
  function Ctor() {
    return lastInstance;
  }
  // @ts-expect-error — test stub
  window.webkitSpeechRecognition = Ctor;
}

afterEach(() => {
  // @ts-expect-error — cleanup test stub
  delete window.webkitSpeechRecognition;
});

function finalResult(transcript: string) {
  act(() => {
    lastInstance.onresult?.({
      resultIndex: 0,
      results: [{ 0: { transcript }, isFinal: true }],
    });
  });
}

describe("VoiceSupport", () => {
  it("hides the control entirely when SpeechRecognition isn't supported", () => {
    render(
      <VoiceSupport settings={DEFAULT_A11Y_SETTINGS} onCommand={vi.fn()} onReset={vi.fn()} />
    );
    expect(screen.getByText(/this browser doesn.t support/i)).toBeInTheDocument();
    expect(screen.queryByTestId("a11y-voice-toggle")).not.toBeInTheDocument();
  });

  it("starts listening and runs the matching command for a recognized phrase", () => {
    installMockRecognition();
    const onCommand = vi.fn();
    render(
      <VoiceSupport settings={DEFAULT_A11Y_SETTINGS} onCommand={onCommand} onReset={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId("a11y-voice-toggle"));
    expect(lastInstance.start).toHaveBeenCalled();

    finalResult("please make it dark mode now");

    expect(onCommand).toHaveBeenCalledWith({ contrast: "dark" });
    expect(screen.getByTestId("a11y-voice-last-command")).toHaveTextContent("Dark mode");
  });

  it("calls onScroll for scroll commands", () => {
    installMockRecognition();
    const onScroll = vi.fn();
    render(
      <VoiceSupport
        settings={DEFAULT_A11Y_SETTINGS}
        onCommand={vi.fn()}
        onScroll={onScroll}
        onReset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("a11y-voice-toggle"));
    finalResult("scroll down");

    expect(onScroll).toHaveBeenCalledWith("down");
  });

  it("calls onReset for the reset command", () => {
    installMockRecognition();
    const onReset = vi.fn();
    render(
      <VoiceSupport settings={DEFAULT_A11Y_SETTINGS} onCommand={vi.fn()} onReset={onReset} />
    );

    fireEvent.click(screen.getByTestId("a11y-voice-toggle"));
    finalResult("reset all");

    expect(onReset).toHaveBeenCalled();
  });

  it("stops listening on toggle-off", () => {
    installMockRecognition();
    render(
      <VoiceSupport settings={DEFAULT_A11Y_SETTINGS} onCommand={vi.fn()} onReset={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId("a11y-voice-toggle"));
    fireEvent.click(screen.getByText("Stop listening"));

    expect(lastInstance.stop).toHaveBeenCalled();
  });
});
