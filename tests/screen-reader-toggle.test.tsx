import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScreenReaderToggle } from "@/components/workbench/explore/screen-reader-toggle";

class MockUtterance {
  text: string;
  lang = "";
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error cleanup test stub
  delete window.speechSynthesis;
  // @ts-expect-error cleanup test stub
  delete window.SpeechSynthesisUtterance;
});

function installMockSpeechSynthesis() {
  const speak = vi.fn();
  const cancel = vi.fn();
  vi.stubGlobal("speechSynthesis", { speak, cancel });
  // @ts-expect-error test stub
  window.SpeechSynthesisUtterance = MockUtterance;
  return { speak, cancel };
}

describe("ScreenReaderToggle", () => {
  it("shows an unsupported message when speechSynthesis isn't available", () => {
    render(<ScreenReaderToggle onGetPageText={() => "hello"} />);
    expect(screen.getByText(/doesn.t support/i)).toBeInTheDocument();
    expect(screen.queryByTestId("a11y-screen-reader-toggle")).not.toBeInTheDocument();
  });

  it("reads the page text aloud via speechSynthesis when clicked", () => {
    const { speak } = installMockSpeechSynthesis();
    render(<ScreenReaderToggle onGetPageText={() => "Hello world"} />);

    fireEvent.click(screen.getByTestId("a11y-screen-reader-toggle"));

    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.text).toBe("Hello world");
    expect(screen.getByText("Stop reading")).toBeInTheDocument();
  });

  it("does nothing when the page text is empty", () => {
    const { speak } = installMockSpeechSynthesis();
    render(<ScreenReaderToggle onGetPageText={() => "   "} />);

    fireEvent.click(screen.getByTestId("a11y-screen-reader-toggle"));

    expect(speak).not.toHaveBeenCalled();
  });

  it("cancels speech when clicked again while speaking", () => {
    const { speak, cancel } = installMockSpeechSynthesis();
    render(<ScreenReaderToggle onGetPageText={() => "Hello world"} />);

    fireEvent.click(screen.getByTestId("a11y-screen-reader-toggle"));
    expect(speak).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("a11y-screen-reader-toggle"));
    expect(cancel).toHaveBeenCalled();
    expect(screen.getByText("Read page aloud")).toBeInTheDocument();
  });
});
