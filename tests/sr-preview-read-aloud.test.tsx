import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SrPreview } from "@/components/workbench/sr-preview";

vi.mock("@/lib/supabase/client", () => ({
  authHeaders: vi.fn(async () => ({})),
}));

class MockUtterance {
  text: string;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

let speakMock: ReturnType<typeof vi.fn>;
let cancelMock: ReturnType<typeof vi.fn>;
let pauseMock: ReturnType<typeof vi.fn>;
let resumeMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  speakMock = vi.fn();
  cancelMock = vi.fn();
  pauseMock = vi.fn();
  resumeMock = vi.fn();
  // @ts-expect-error — jsdom has no real SpeechSynthesisUtterance
  global.SpeechSynthesisUtterance = MockUtterance;
  Object.defineProperty(window, "speechSynthesis", {
    value: { speak: speakMock, cancel: cancelMock, pause: pauseMock, resume: resumeMock },
    writable: true,
    configurable: true,
  });

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ lines: ["heading level 1, Welcome", "button, Subscribe"] }),
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Deliberately NOT deleting window.speechSynthesis here — RTL's own
  // global afterEach (setup.ts) unmounts the component after this hook
  // runs, which fires SrPreview's unmount-cleanup calling
  // speechSynthesis.cancel(); deleting it first would crash that cleanup.
  // beforeEach reassigns a fresh stub before every test regardless.
});

async function openWithTranscript() {
  render(<SrPreview auditId="audit-1" targetUrl="https://example.com" />);
  fireEvent.click(screen.getByText("SR Preview (AX tree)"));
  await waitFor(() => expect(screen.getByTestId("sr-read-aloud")).toBeInTheDocument());
}

describe("SrPreview — Read aloud (Web Speech API)", () => {
  it("speaks the first transcript line when 'Read aloud' is clicked", async () => {
    await openWithTranscript();

    fireEvent.click(screen.getByTestId("sr-read-aloud"));

    await waitFor(() => expect(speakMock).toHaveBeenCalledTimes(1));
    expect((speakMock.mock.calls[0][0] as MockUtterance).text).toBe("heading level 1, Welcome");
  });

  it("advances to the next line when the current utterance ends, and highlights it", async () => {
    await openWithTranscript();

    fireEvent.click(screen.getByTestId("sr-read-aloud"));
    await waitFor(() => expect(speakMock).toHaveBeenCalledTimes(1));

    const firstUtterance = speakMock.mock.calls[0][0] as MockUtterance;
    firstUtterance.onend?.();

    await waitFor(() => expect(speakMock).toHaveBeenCalledTimes(2));
    expect((speakMock.mock.calls[1][0] as MockUtterance).text).toBe("button, Subscribe");
  });

  it("clicking the button while speaking pauses instead of restarting", async () => {
    await openWithTranscript();

    fireEvent.click(screen.getByTestId("sr-read-aloud"));
    await waitFor(() => expect(screen.getByText("Pause")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Pause"));

    expect(pauseMock).toHaveBeenCalled();
    expect(screen.getByText("Resume")).toBeInTheDocument();
  });

  it("Stop cancels speech and removes the Stop button", async () => {
    await openWithTranscript();

    fireEvent.click(screen.getByTestId("sr-read-aloud"));
    await waitFor(() => expect(screen.getByTestId("sr-stop-reading")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("sr-stop-reading"));

    expect(cancelMock).toHaveBeenCalled();
    expect(screen.queryByTestId("sr-stop-reading")).not.toBeInTheDocument();
    expect(screen.getByText("Read aloud")).toBeInTheDocument();
  });

  it("collapsing the panel stops any in-progress speech", async () => {
    await openWithTranscript();
    fireEvent.click(screen.getByTestId("sr-read-aloud"));
    await waitFor(() => expect(screen.getByTestId("sr-stop-reading")).toBeInTheDocument());

    fireEvent.click(screen.getByText("SR Preview (AX tree)"));

    expect(cancelMock).toHaveBeenCalled();
  });
});
