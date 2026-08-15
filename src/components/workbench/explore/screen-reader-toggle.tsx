"use client";

import { useEffect, useState } from "react";

interface ScreenReaderToggleProps {
  /** Returns the live preview's current visible text on demand. Omitted (or
   * returning empty) simply means there's nothing to read yet. */
  onGetPageText?: () => string;
}

const MAX_CHARS = 8000;

/**
 * "Screen Reader" — UX4G groups this under Orientation Adjustment, right
 * next to Voice Support: a toggle inside the accessibility widget itself
 * that reads the current page aloud, distinct from the standalone
 * Screen Reader tab (SrPreview/NvdaPanel), which works off the captured AX
 * tree instead of the live DOM. Browser-native window.speechSynthesis /
 * SpeechSynthesisUtterance, no server dependency — unsupported browsers
 * simply don't see the control, same pattern as Voice Support.
 */
export function ScreenReaderToggle({ onGetPageText }: ScreenReaderToggleProps) {
  const [supported] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window
  );
  const [speaking, setSpeaking] = useState(false);

  function stop() {
    if (supported && typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  // Never leave speech running once this control unmounts.
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps

  function play() {
    if (!supported) return;
    const text = (onGetPageText?.() ?? "").trim();
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, MAX_CHARS));
    utterance.lang = "en-US";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  if (!supported) {
    return (
      <section className="border-t pt-2">
        <h4 className="font-semibold mb-1.5">Screen Reader</h4>
        <p className="text-[11px] text-muted-foreground">
          Reading the page aloud needs speechSynthesis, which this browser doesn&apos;t support.
        </p>
      </section>
    );
  }

  return (
    <section className="border-t pt-2">
      <h4 className="font-semibold mb-1.5">Screen Reader</h4>
      <button
        data-testid="a11y-screen-reader-toggle"
        onClick={() => (speaking ? stop() : play())}
        className={`w-full px-2 py-1.5 rounded border text-xs transition-colors ${
          speaking ? "bg-red-600 text-white border-transparent" : "hover:bg-accent/50"
        }`}
      >
        {speaking ? "Stop reading" : "Read page aloud"}
      </button>
    </section>
  );
}
