"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  // Refs for keep-alive and error tracking
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSpeakingRef = useRef(false);
  const lastErrorIndexRef = useRef<number | null>(null);
  const consecutiveErrorsRef = useRef<number>(0);

  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Helper: ensure voices are loaded before speaking. Guarded for engines
  // that expose speechSynthesis without the (optional) getVoices /
  // addEventListener surface (older browsers, and the jsdom test stub) —
  // there we simply proceed without waiting.
  const ensureVoicesLoaded = useCallback(async () => {
    if (!speechSupported) return;
    const synth = window.speechSynthesis;
    if (typeof synth.getVoices !== "function") return;
    if (synth.getVoices().length > 0) return; // already loaded
    if (typeof synth.addEventListener !== "function") return;

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 1000); // 1s fallback
      const onVoicesChanged = () => {
        clearTimeout(timeout);
        synth.removeEventListener("voiceschanged", onVoicesChanged);
        resolve();
      };
      synth.addEventListener("voiceschanged", onVoicesChanged);
    });
  }, [speechSupported]);

  // Helper: get an English voice if available (null when the engine has no
  // getVoices, e.g. the test stub — the utterance still carries lang).
  const getEnglishVoice = useCallback(() => {
    const synth = window.speechSynthesis;
    if (typeof synth.getVoices !== "function") return null;
    return (
      synth.getVoices().find(
        (voice) =>
          voice.lang.startsWith("en") ||
          voice.name.toLowerCase().includes("english")
      ) || null
    );
  }, []);

  // Clear keep-alive interval
  const clearKeepAlive = useCallback(() => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (speechSupported) window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    clearKeepAlive();
    lastErrorIndexRef.current = null;
    consecutiveErrorsRef.current = 0;
    setIsSpeaking(false);
    setIsPaused(false);
    setSpeakingIndex(null);
  }, [speechSupported, clearKeepAlive]);

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

  async function speakFrom(startIndex: number) {
    if (!speechSupported || !lines || lines.length === 0) return;

    // Ensure voices are loaded before starting
    await ensureVoicesLoaded();

    window.speechSynthesis.cancel();
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    setIsPaused(false);
    lastErrorIndexRef.current = null;
    consecutiveErrorsRef.current = 0;

    let i = startIndex;
    const speakNext = () => {
      if (!lines || i >= lines.length) {
        isSpeakingRef.current = false;
        clearKeepAlive();
        setIsSpeaking(false);
        setSpeakingIndex(null);
        lastErrorIndexRef.current = null;
        consecutiveErrorsRef.current = 0;
        return;
      }
      const utterance = new SpeechSynthesisUtterance(lines[i]);

      // Set language and voice
      utterance.lang = "en-US";
      const enVoice = getEnglishVoice();
      if (enVoice) {
        utterance.voice = enVoice;
      }

      setSpeakingIndex(i);

      utterance.onend = () => {
        lastErrorIndexRef.current = null;
        consecutiveErrorsRef.current = 0;
        i += 1;
        speakNext();
      };

      utterance.onerror = (event) => {
        // Ignore self-inflicted interruptions
        if (event.error === "interrupted" || event.error === "canceled") {
          return;
        }

        // Guard against infinite error loops
        if (lastErrorIndexRef.current === i) {
          consecutiveErrorsRef.current += 1;
          if (consecutiveErrorsRef.current >= 3) {
            isSpeakingRef.current = false;
            clearKeepAlive();
            setIsSpeaking(false);
            setSpeakingIndex(null);
            lastErrorIndexRef.current = null;
            consecutiveErrorsRef.current = 0;
            return;
          }
        } else {
          lastErrorIndexRef.current = i;
          consecutiveErrorsRef.current = 1;
        }

        // Advance to next line instead of killing the chain
        i += 1;
        speakNext();
      };

      window.speechSynthesis.speak(utterance);
    };

    speakNext();

    // Set up keep-alive to prevent Chrome auto-pause on long reads
    clearKeepAlive();
    keepAliveIntervalRef.current = setInterval(() => {
      if (isSpeakingRef.current) {
        window.speechSynthesis.resume();
      }
    }, 10000); // Every 10 seconds
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
