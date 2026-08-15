"use client";

import { useEffect, useRef, useState } from "react";

export interface AccessibilityProfileSettings {
  profile: string;
  contrast: "none" | "dark" | "light" | "high" | "invert";
  saturation: "none" | "low" | "high" | "grayscale";
  textScale: number;
  lineHeight: "none" | "loose" | "loosest";
  letterSpacing: "none" | "wide" | "wider";
  dyslexiaFont: boolean;
  textAlign: "none" | "left" | "center";
  highlightLinks: boolean;
  hideImages: boolean;
  reducedMotion: boolean;
  bigCursor: boolean;
  readingGuide: boolean;
  readingMask: boolean;
  tooltips: boolean;
  focusMode: boolean;
  textMagnify: boolean;
}

export type Orientation = "portrait" | "landscape";

interface AccessibilityOptionsPanelProps {
  onApply: (settings: AccessibilityProfileSettings) => void;
  orientation: Orientation;
  onOrientationChange: (orientation: Orientation) => void;
  /** "fab" (default) = UX4G-style floating button + panel overlay.
   *  "inline" = render the controls directly (for the left-column tab). */
  variant?: "fab" | "inline";
}

export const DEFAULT_A11Y_SETTINGS: AccessibilityProfileSettings = {
  profile: "none",
  contrast: "none",
  saturation: "none",
  textScale: 100,
  lineHeight: "none",
  letterSpacing: "none",
  dyslexiaFont: false,
  textAlign: "none",
  highlightLinks: false,
  hideImages: false,
  reducedMotion: false,
  bigCursor: false,
  readingGuide: false,
  readingMask: false,
  tooltips: false,
  focusMode: false,
  textMagnify: false,
};

interface PresetProfile {
  id: string;
  label: string;
  settings: Partial<AccessibilityProfileSettings>;
}

// Matches the 8 profiles in UX4G's own "Accessibility Profile" dropdown
// (ux4g.gov.in, Ctrl+F2 widget) verbatim, plus a "None" reset.
const PRESETS: PresetProfile[] = [
  { id: "none", label: "None", settings: DEFAULT_A11Y_SETTINGS },
  {
    id: "seizure-safe",
    label: "Seizure Safe",
    settings: { reducedMotion: true, saturation: "low" },
  },
  {
    id: "color-blindness",
    label: "Color Blindness",
    settings: { saturation: "grayscale", contrast: "high" },
  },
  {
    id: "low-vision",
    label: "Low Vision",
    settings: { textScale: 150, contrast: "high", bigCursor: true },
  },
  {
    id: "vision-impaired",
    label: "Visually Impaired",
    settings: { textScale: 200, contrast: "high", highlightLinks: true, bigCursor: true },
  },
  {
    id: "senior-citizens",
    label: "Senior Citizens",
    settings: { textScale: 125, lineHeight: "loose", bigCursor: true },
  },
  {
    id: "dyslexia",
    label: "Dyslexia",
    settings: { dyslexiaFont: true, letterSpacing: "wide", lineHeight: "loose", textAlign: "left" },
  },
  {
    id: "motor-impairment",
    label: "Motor Impairment",
    settings: { bigCursor: true, focusMode: true, reducedMotion: true },
  },
  {
    id: "adhd",
    label: "Cognitive / ADHD",
    settings: { readingMask: true, reducedMotion: true, focusMode: true },
  },
];

const TEXT_SCALES = [100, 125, 150, 175, 200];

/**
 * "Accessibility Options" FAB + panel (Ctrl+F2), modeled on the
 * UX4G-style accessibility widget. Provides comprehensive accessibility
 * adjustments with presets (profiles), color, text, content, and aid controls.
 * Applies ONLY to the proxied preview iframe via the __ableInspect bridge's
 * applyAccessibilityProfile — a testing/demo tool, never injected onto the
 * real target site.
 */
export function AccessibilityOptionsPanel({
  onApply,
  orientation,
  onOrientationChange,
  variant = "fab",
}: AccessibilityOptionsPanelProps) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AccessibilityProfileSettings>(DEFAULT_A11Y_SETTINGS);
  const [activeProfile, setActiveProfile] = useState("none");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onApply(settings);
  }, [settings, onApply]);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "F2") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  function applyPreset(preset: PresetProfile) {
    setActiveProfile(preset.id);
    const newSettings = { ...DEFAULT_A11Y_SETTINGS, ...preset.settings };
    setSettings(newSettings);
  }

  function updateSettings(updates: Partial<AccessibilityProfileSettings>) {
    setActiveProfile("custom");
    setSettings((s) => ({ ...s, ...updates }));
  }

  const body = (
    <div className="p-3 space-y-3">
            {/* Profiles */}
            <section>
              <h4 className="font-semibold mb-1.5">Profiles</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    data-testid={`a11y-preset-${p.id}`}
                    onClick={() => applyPreset(p)}
                    className={`px-2 py-1.5 rounded border text-left transition-colors text-xs ${
                      activeProfile === p.id
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Color */}
            <section className="border-t pt-2">
              <h4 className="font-semibold mb-1.5">Color</h4>
              <div className="space-y-1.5">
                <div>
                  <label className="block text-[10px] font-medium mb-1">Contrast</label>
                  <select
                    data-testid="a11y-contrast"
                    value={settings.contrast}
                    onChange={(e) =>
                      updateSettings({ contrast: e.target.value as AccessibilityProfileSettings["contrast"] })
                    }
                    className="w-full px-2 py-1.5 rounded border bg-background text-xs"
                  >
                    <option value="none">None</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="high">High</option>
                    <option value="invert">Invert</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1">Saturation</label>
                  <select
                    data-testid="a11y-saturation"
                    value={settings.saturation}
                    onChange={(e) =>
                      updateSettings({ saturation: e.target.value as AccessibilityProfileSettings["saturation"] })
                    }
                    className="w-full px-2 py-1.5 rounded border bg-background text-xs"
                  >
                    <option value="none">None</option>
                    <option value="low">Low</option>
                    <option value="high">High</option>
                    <option value="grayscale">Grayscale</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Text */}
            <section className="border-t pt-2">
              <h4 className="font-semibold mb-1.5">Text</h4>
              <div className="space-y-1.5">
                <div>
                  <label className="block text-[10px] font-medium mb-1">Text Size</label>
                  <div className="grid grid-cols-5 gap-1">
                    {TEXT_SCALES.map((scale) => (
                      <button
                        key={scale}
                        data-testid={`a11y-text-scale-${scale}`}
                        onClick={() => updateSettings({ textScale: scale })}
                        className={`px-1 py-1 rounded border text-xs transition-colors ${
                          settings.textScale === scale
                            ? "bg-primary text-primary-foreground border-transparent"
                            : "hover:bg-accent/50"
                        }`}
                      >
                        {scale}%
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1">Line Height</label>
                  <select
                    data-testid="a11y-line-height"
                    value={settings.lineHeight}
                    onChange={(e) =>
                      updateSettings({ lineHeight: e.target.value as AccessibilityProfileSettings["lineHeight"] })
                    }
                    className="w-full px-2 py-1.5 rounded border bg-background text-xs"
                  >
                    <option value="none">Normal</option>
                    <option value="loose">Loose (1.5)</option>
                    <option value="loosest">Very Loose (2.0)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1">Letter Spacing</label>
                  <select
                    data-testid="a11y-letter-spacing"
                    value={settings.letterSpacing}
                    onChange={(e) =>
                      updateSettings({ letterSpacing: e.target.value as AccessibilityProfileSettings["letterSpacing"] })
                    }
                    className="w-full px-2 py-1.5 rounded border bg-background text-xs"
                  >
                    <option value="none">Normal</option>
                    <option value="wide">Wide</option>
                    <option value="wider">Very Wide</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1">Text Align</label>
                  <select
                    data-testid="a11y-text-align"
                    value={settings.textAlign}
                    onChange={(e) =>
                      updateSettings({ textAlign: e.target.value as AccessibilityProfileSettings["textAlign"] })
                    }
                    className="w-full px-2 py-1.5 rounded border bg-background text-xs"
                  >
                    <option value="none">Default</option>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="a11y-dyslexia-font"
                    checked={settings.dyslexiaFont}
                    onChange={(e) => updateSettings({ dyslexiaFont: e.target.checked })}
                  />
                  <span>Dyslexia-friendly font</span>
                </label>
              </div>
            </section>

            {/* Content */}
            <section className="border-t pt-2">
              <h4 className="font-semibold mb-1.5">Content</h4>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="a11y-highlight-links"
                    checked={settings.highlightLinks}
                    onChange={(e) => updateSettings({ highlightLinks: e.target.checked })}
                  />
                  <span>Highlight links</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="a11y-hide-images"
                    checked={settings.hideImages}
                    onChange={(e) => updateSettings({ hideImages: e.target.checked })}
                  />
                  <span>Hide images</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="a11y-reduced-motion"
                    checked={settings.reducedMotion}
                    onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
                  />
                  <span>Pause animations</span>
                </label>
              </div>
            </section>

            {/* Aids */}
            <section className="border-t pt-2">
              <h4 className="font-semibold mb-1.5">Accessibility Aids</h4>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="a11y-big-cursor"
                    checked={settings.bigCursor}
                    onChange={(e) => updateSettings({ bigCursor: e.target.checked })}
                  />
                  <span>Large cursor</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="a11y-reading-guide"
                    checked={settings.readingGuide}
                    onChange={(e) => updateSettings({ readingGuide: e.target.checked })}
                  />
                  <span>Reading line</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="a11y-reading-mask"
                    checked={settings.readingMask}
                    onChange={(e) => updateSettings({ readingMask: e.target.checked })}
                  />
                  <span>Reading mask</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="a11y-tooltips"
                    checked={settings.tooltips}
                    onChange={(e) => updateSettings({ tooltips: e.target.checked })}
                  />
                  <span>Show tooltips</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="a11y-focus-mode"
                    checked={settings.focusMode}
                    onChange={(e) => updateSettings({ focusMode: e.target.checked })}
                  />
                  <span>Focus mode (stronger focus outline)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="a11y-text-magnify"
                    checked={settings.textMagnify}
                    onChange={(e) => updateSettings({ textMagnify: e.target.checked })}
                  />
                  <span>Text magnify (enlarge text on hover)</span>
                </label>
              </div>
            </section>

            {/* Orientation */}
            <section className="border-t pt-2">
              <h4 className="font-semibold mb-1.5">Orientation</h4>
              <div className="flex gap-1.5">
                {(["portrait", "landscape"] as const).map((o) => (
                  <button
                    key={o}
                    data-testid={`a11y-orientation-${o}`}
                    onClick={() => onOrientationChange(o)}
                    className={`flex-1 px-2 py-1.5 rounded border capitalize transition-colors text-xs ${
                      orientation === o
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </section>
    </div>
  );

  if (variant === "inline") {
    return (
      <div data-testid="a11y-options-inline" className="h-full overflow-y-auto text-xs">
        {body}
      </div>
    );
  }

  return (
    <>
      <button
        data-testid="a11y-options-fab"
        onClick={() => setOpen((v) => !v)}
        title="Accessibility Options (Ctrl+F2)"
        aria-expanded={open}
        className="absolute bottom-4 right-4 z-40 w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center text-lg hover:opacity-90 transition-opacity"
      >
        ♿
      </button>

      {open && (
        <div
          ref={panelRef}
          data-testid="a11y-options-panel"
          className="absolute bottom-20 right-4 z-40 w-80 max-h-[85%] overflow-y-auto rounded-lg border bg-background shadow-xl text-xs"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20 sticky top-0">
            <span className="font-semibold">Accessibility Options</span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close accessibility options"
            >
              ✕
            </button>
          </div>
          {body}
        </div>
      )}
    </>
  );
}
