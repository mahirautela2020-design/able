"use client";

import { useEffect, useRef, useState } from "react";
import { CVD_FILTERS, CVD_LABELS, CVD_TYPES } from "@/lib/cvd";

export interface AccessibilityProfileSettings {
  filter: string;
  textScale: number;
  reducedMotion: boolean;
}

export type Orientation = "portrait" | "landscape";

interface AccessibilityOptionsPanelProps {
  onApply: (settings: AccessibilityProfileSettings) => void;
  orientation: Orientation;
  onOrientationChange: (orientation: Orientation) => void;
}

const DEFAULT_SETTINGS: AccessibilityProfileSettings = {
  filter: "none",
  textScale: 100,
  reducedMotion: false,
};

const DISPLAY_FILTERS: { id: string; label: string; filter: string }[] = [
  { id: "none", label: "None", filter: "none" },
  { id: "high-contrast", label: "High contrast", filter: "contrast(1.8) grayscale(0.3)" },
  { id: "invert", label: "Invert colors", filter: "invert(1) hue-rotate(180deg)" },
  { id: "grayscale", label: "Grayscale", filter: "grayscale(1)" },
  ...CVD_TYPES.map((t) => ({ id: t, label: CVD_LABELS[t], filter: CVD_FILTERS[t] })),
];

const TEXT_SCALES = [100, 125, 150, 175];

interface Profile {
  id: string;
  label: string;
  settings: AccessibilityProfileSettings;
}

const PROFILES: Profile[] = [
  { id: "default", label: "Default", settings: DEFAULT_SETTINGS },
  {
    id: "low-vision",
    label: "Low Vision",
    settings: { filter: "contrast(1.3)", textScale: 150, reducedMotion: false },
  },
  {
    id: "high-contrast",
    label: "High Contrast",
    settings: { filter: "contrast(1.8) grayscale(0.3)", textScale: 100, reducedMotion: false },
  },
  {
    id: "reduced-motion",
    label: "Reduced Motion",
    settings: { filter: "none", textScale: 100, reducedMotion: true },
  },
  {
    id: "larger-text",
    label: "Larger Text",
    settings: { filter: "none", textScale: 150, reducedMotion: false },
  },
];

/**
 * "Accessibility Options" FAB + panel (Ctrl+F2), modeled on the
 * UX4G-style accessibility widget — Profile presets, Color Contrast,
 * Color Adjustment, Orientation Adjustment. Applies ONLY to our own
 * proxied preview iframe via the __ableInspect bridge's
 * applyAccessibilityProfile — a testing/demo tool, never injected onto
 * the real target site.
 */
export function AccessibilityOptionsPanel({
  onApply,
  orientation,
  onOrientationChange,
}: AccessibilityOptionsPanelProps) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AccessibilityProfileSettings>(DEFAULT_SETTINGS);
  const [activeProfile, setActiveProfile] = useState("default");
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

  function applyProfile(profile: Profile) {
    setActiveProfile(profile.id);
    setSettings(profile.settings);
  }

  function setFilter(filter: string) {
    setActiveProfile("custom");
    setSettings((s) => ({ ...s, filter }));
  }

  function setTextScale(textScale: number) {
    setActiveProfile("custom");
    setSettings((s) => ({ ...s, textScale }));
  }

  function toggleReducedMotion() {
    setActiveProfile("custom");
    setSettings((s) => ({ ...s, reducedMotion: !s.reducedMotion }));
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
          className="absolute bottom-20 right-4 z-40 w-72 max-h-[70%] overflow-y-auto rounded-lg border bg-background shadow-xl text-xs"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
            <span className="font-semibold">Accessibility Options</span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close accessibility options"
            >
              ✕
            </button>
          </div>

          <div className="p-3 space-y-4">
            <section>
              <h4 className="font-semibold mb-1.5">Accessibility Profile</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {PROFILES.map((p) => (
                  <button
                    key={p.id}
                    data-testid={`a11y-profile-${p.id}`}
                    onClick={() => applyProfile(p)}
                    className={`px-2 py-1.5 rounded border transition-colors text-left ${
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

            <section>
              <h4 className="font-semibold mb-1.5">Color Contrast &amp; Adjustment</h4>
              <select
                data-testid="a11y-filter-select"
                value={settings.filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded border bg-background"
              >
                {DISPLAY_FILTERS.map((f) => (
                  <option key={f.id} value={f.filter}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Simulated in this preview only — verify with real users before shipping.
              </p>
            </section>

            <section>
              <h4 className="font-semibold mb-1.5">Text Size</h4>
              <div className="flex gap-1.5">
                {TEXT_SCALES.map((scale) => (
                  <button
                    key={scale}
                    data-testid={`a11y-text-scale-${scale}`}
                    onClick={() => setTextScale(scale)}
                    className={`flex-1 px-1.5 py-1 rounded border transition-colors ${
                      settings.textScale === scale
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    {scale}%
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h4 className="font-semibold mb-1.5">Motion</h4>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  data-testid="a11y-reduced-motion"
                  checked={settings.reducedMotion}
                  onChange={toggleReducedMotion}
                />
                Reduce motion (pause animations &amp; transitions)
              </label>
            </section>

            <section>
              <h4 className="font-semibold mb-1.5">Orientation Adjustment</h4>
              <div className="flex gap-1.5">
                {(["portrait", "landscape"] as const).map((o) => (
                  <button
                    key={o}
                    data-testid={`a11y-orientation-${o}`}
                    onClick={() => onOrientationChange(o)}
                    className={`flex-1 px-2 py-1.5 rounded border capitalize transition-colors ${
                      orientation === o
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Simulated by resizing the preview — an iframe can&apos;t truly rotate the
                target device.
              </p>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
