"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccessibilityProfileSettings } from "./accessibility-options";

// Minimal shape of the Web Speech API's SpeechRecognition — narrowed so this
// file doesn't depend on lib.dom's (inconsistent, vendor-prefixed) types.
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Web Speech API onerror codes and what each actually means for the user --
// "not-allowed" alone was previously shown as a flat "Microphone access
// denied," which is technically true but unhelpful: on a locked-down
// corporate laptop the OS/browser policy can deny the mic (or block the
// underlying speech-recognition network request) with no permission prompt
// ever shown, making it look identical to "you clicked Block" when it's
// actually IT policy the user has no control over. Each code gets a
// distinct, actionable message instead of one generic line.
function explainVoiceError(code: string): string {
  switch (code) {
    case "not-allowed":
      return "Microphone access denied. Check your browser's address-bar mic icon, and if you're on a managed/work device, your organization's IT policy may block microphone access entirely.";
    case "service-not-allowed":
      return "Voice recognition was blocked at the browser or system level (common on managed work devices) -- this isn't something the page controls.";
    case "audio-capture":
      return "No microphone was found. Voice commands need a working mic connected to this device.";
    case "network":
      return "Couldn't reach the voice-recognition service -- this often happens on restrictive corporate networks or VPNs that block it.";
    case "no-speech":
      return "Didn't hear anything -- try again and speak after clicking Start.";
    case "aborted":
      return "Voice recognition stopped.";
    default:
      return `Voice recognition error: ${code}`;
  }
}

// Chrome blocks getUserMedia's mic-permission prompt inside a
// chrome-extension:// document (side panel/popup) even though
// webkitSpeechRecognition is present there -- every attempt fails with
// onerror "not-allowed", which would otherwise look identical to a user
// actually denying the permission. Detect the extension context up front
// and say so plainly instead of showing that misleading message.
function isExtensionContext(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "chrome-extension:";
}

const TEXT_SCALES = [100, 125, 150, 175, 200];

/** One command's trigger phrases and effect. Matched by substring against
 * the recognized transcript, first match wins. */
function buildCommands(
  settings: AccessibilityProfileSettings,
  onCommand: (updates: Partial<AccessibilityProfileSettings>) => void,
  onScroll: ((direction: "up" | "down") => void) | undefined,
  onReset: () => void
): Array<{ phrases: string[]; label: string; run: () => void }> {
  const scaleIndex = TEXT_SCALES.indexOf(settings.textScale);
  return [
    {
      phrases: ["bigger text", "increase text", "larger text", "zoom in"],
      label: "Increase text size",
      run: () => onCommand({ textScale: TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, scaleIndex) + 1)] }),
    },
    {
      phrases: ["smaller text", "decrease text", "zoom out"],
      label: "Decrease text size",
      run: () => onCommand({ textScale: TEXT_SCALES[Math.max(0, (scaleIndex === -1 ? TEXT_SCALES.length - 1 : scaleIndex) - 1)] }),
    },
    {
      phrases: ["dark mode"],
      label: "Dark mode",
      run: () => onCommand({ contrast: "dark" }),
    },
    {
      phrases: ["invert colors", "invert color"],
      label: "Invert colors",
      run: () => onCommand({ contrast: "invert" }),
    },
    {
      phrases: ["grayscale", "greyscale", "monochrome"],
      label: "Grayscale",
      run: () => onCommand({ saturation: "grayscale" }),
    },
    {
      phrases: ["highlight links"],
      label: "Highlight links",
      run: () => onCommand({ highlightLinks: true }),
    },
    {
      phrases: ["hide images"],
      label: "Hide images",
      run: () => onCommand({ hideImages: true }),
    },
    {
      phrases: ["big cursor", "large cursor"],
      label: "Big cursor",
      run: () => onCommand({ bigCursor: true }),
    },
    {
      phrases: ["pause animations", "stop animations"],
      label: "Pause animations",
      run: () => onCommand({ reducedMotion: true }),
    },
    {
      phrases: ["scroll down", "page down"],
      label: "Scroll down",
      run: () => onScroll?.("down"),
    },
    {
      phrases: ["scroll up", "page up"],
      label: "Scroll up",
      run: () => onScroll?.("up"),
    },
    {
      phrases: ["reset", "reset all", "clear settings", "reset settings"],
      label: "Reset",
      run: onReset,
    },
  ];
}

interface VoiceSupportProps {
  settings: AccessibilityProfileSettings;
  onCommand: (updates: Partial<AccessibilityProfileSettings>) => void;
  onScroll?: (direction: "up" | "down") => void;
  onReset: () => void;
}

/**
 * "Voice Support" (UX4G's term for voice-command page control) — the Web
 * Speech API's SpeechRecognition, browser-native, no server/API dependency.
 * Support is Chrome/Edge-only today (Firefox/Safari don't implement it);
 * unsupported browsers simply don't see the control, same pattern as the
 * Read Aloud feature.
 *
 * Every recognized command is also shown as text (never voice-only
 * feedback), and the running transcript is visible while listening.
 */
export function VoiceSupport({ settings, onCommand, onScroll, onReset }: VoiceSupportProps) {
  const [supported] = useState(() => getRecognitionCtor() !== null && !isExtensionContext());
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Commands read current settings/props each call without re-binding the
  // recognizer's onresult handler on every keystroke of settings changes.
  const commandsRef = useRef(buildCommands(settings, onCommand, onScroll, onReset));
  useEffect(() => {
    commandsRef.current = buildCommands(settings, onCommand, onScroll, onReset);
  }, [settings, onCommand, onScroll, onReset]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  useEffect(() => stopListening, [stopListening]);

  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setError(null);
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (ev) => {
      let text = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        text += ev.results[i][0].transcript;
        if (ev.results[i].isFinal) {
          const heard = ev.results[i][0].transcript.trim().toLowerCase();
          const match = commandsRef.current.find((c) => c.phrases.some((p) => heard.includes(p)));
          if (match) {
            match.run();
            setLastCommand(match.label);
          }
        }
      }
      setTranscript(text);
    };
    recognition.onerror = (ev) => {
      setError(explainVoiceError(ev.error));
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  if (!supported) {
    return (
      <section className="border-t pt-2">
        <h4 className="font-semibold mb-1.5">Voice Support</h4>
        <p className="text-[11px] text-muted-foreground">
          {isExtensionContext()
            ? "Voice commands aren't available inside the extension's side panel — Chrome blocks microphone access there. Try this on the ScanA11y website instead."
            : "Voice commands need SpeechRecognition, which this browser doesn't support (Chrome/Edge only)."}
        </p>
      </section>
    );
  }

  return (
    <section className="border-t pt-2">
      <h4 className="font-semibold mb-1.5">Voice Support</h4>
      <button
        data-testid="a11y-voice-toggle"
        onClick={() => (listening ? stopListening() : startListening())}
        className={`w-full px-2 py-1.5 rounded border text-xs transition-colors ${
          listening ? "bg-red-600 text-white border-transparent" : "hover:bg-accent/50"
        }`}
      >
        {listening ? "Stop listening" : "Start voice commands"}
      </button>
      <p className="text-[10px] text-muted-foreground mt-1">
        Try: &quot;bigger text&quot;, &quot;dark mode&quot;, &quot;scroll down&quot;, &quot;reset&quot;.
      </p>
      {listening && (
        <p data-testid="a11y-voice-transcript" className="text-[11px] mt-1.5 italic text-muted-foreground">
          Listening… {transcript || "…"}
        </p>
      )}
      {lastCommand && (
        <p data-testid="a11y-voice-last-command" className="text-[11px] mt-1 text-primary">
          Ran: {lastCommand}
        </p>
      )}
      {error && <p className="text-[11px] mt-1 text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
