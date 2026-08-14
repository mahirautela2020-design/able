"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/supabase/client";

interface SrPreviewProps {
  auditId: string;
}

/**
 * SR Preview panel — shows the deterministic speech transcript
 * generated from the AX tree for the first audited page, with an
 * optional "Read aloud" using the browser's native Web Speech API
 * (no server/TTS dependency — unsupported browsers just don't see the
 * controls).
 */
export function SrPreview({ auditId }: SrPreviewProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  const [scrollIndex, setScrollIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);

  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const stopSpeaking = useCallback(() => {
    if (speechSupported) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    setSpeakingIndex(null);
  }, [speechSupported]);

  // Never leave speech running once this panel unmounts.
  useEffect(() => stopSpeaking, [stopSpeaking]);

  async function fetchTranscript() {
    setLoading(true);
    setError(false);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/audits/${auditId}/sr-preview`, { headers });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setLines(json.lines ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    const next = !open;
    if (!next) stopSpeaking();
    setOpen(next);
    if (next && lines === null && !loading) {
      await fetchTranscript();
    }
  }

  function handleReadFromTop() {
    stopSpeaking();
    setScrollIndex(0);
  }

  function speakFrom(startIndex: number) {
    if (!speechSupported || !lines || lines.length === 0) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(true);
    setIsPaused(false);

    let i = startIndex;
    const speakNext = () => {
      if (!lines || i >= lines.length) {
        setIsSpeaking(false);
        setSpeakingIndex(null);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(lines[i]);
      setSpeakingIndex(i);
      utterance.onend = () => {
        i += 1;
        speakNext();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setSpeakingIndex(null);
      };
      window.speechSynthesis.speak(utterance);
    };
    speakNext();
  }

  function handlePlayPause() {
    if (isSpeaking && !isPaused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      return;
    }
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      return;
    }
    speakFrom(speakingIndex ?? scrollIndex);
  }

  return (
    <div className="border-t bg-background">
      <button
        onClick={handleToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        <span className="text-sm font-medium">SR Preview (AX tree)</span>
        <span className="text-xs text-muted-foreground">
          {open ? "▴ collapse" : "▾ show transcript"}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 max-h-96 overflow-y-auto">
          {loading && (
            <p className="text-xs text-muted-foreground">Loading transcript...</p>
          )}

          {!loading && error && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Could not load SR preview. Try again.
            </p>
          )}

          {!loading && !error && lines !== null && lines.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No speech transcript available for this audit. Run an audit first.
            </p>
          )}

          {!loading && !error && lines !== null && lines.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  {lines.length} announcements
                </span>
                <div className="flex items-center gap-2">
                  {speechSupported && (
                    <>
                      <button
                        data-testid="sr-read-aloud"
                        onClick={handlePlayPause}
                        className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
                      >
                        {isSpeaking && !isPaused ? "Pause" : isPaused ? "Resume" : "Read aloud"}
                      </button>
                      {isSpeaking && (
                        <button
                          data-testid="sr-stop-reading"
                          onClick={stopSpeaking}
                          className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
                        >
                          Stop
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={handleReadFromTop}
                    className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
                  >
                    Read from top
                  </button>
                </div>
              </div>
              <ol
                className="space-y-0.5 font-mono text-[11px] list-decimal list-inside"
                start={scrollIndex + 1}
              >
                {lines.slice(scrollIndex).map((line, i) => {
                  const absoluteIndex = scrollIndex + i;
                  return (
                    <li
                      key={absoluteIndex}
                      className={`py-0.5 border-b border-border/30 ${
                        speakingIndex === absoluteIndex ? "bg-accent/60 rounded" : ""
                      }`}
                    >
                      {line}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
