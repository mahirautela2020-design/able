"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AxSnapshot } from "@/lib/axe/types";
import {
  CVD_FILTERS,
  flagCvdFailures,
  type CvdFlag,
  type CvdType,
} from "@/lib/cvd";
import type {
  Bbox,
  ContrastPairSample,
  InspectedElement,
  KeyboardStep,
} from "@/lib/explore/types";
import { ElementPicker } from "./element-picker";
import { InspectorPanel } from "./inspector-panel";
import { ContrastFix } from "./contrast-fix";
import { KeyboardReplay } from "./keyboard-replay";
import { CvdOverlay } from "./cvd-overlay";
import { AxTreePanel } from "./ax-tree-panel";
import {
  AccessibilityOptionsPanel,
  type AccessibilityProfileSettings,
  type Orientation,
} from "./accessibility-options";

interface AbleBridge {
  inspect: (x: number, y: number) => InspectedElement | null;
  focusables: () => KeyboardStep[];
  contrastPairs: () => ContrastPairSample[];
  patch: (selector: string, styles: Record<string, string>) => boolean;
  highlight: (selector: string) => boolean;
  highlightByRoleName: (role: string, name: string) => boolean;
  focusEl: (selector: string) => boolean;
  setFilter: (filter: string) => boolean;
  applyAccessibilityProfile: (settings: AccessibilityProfileSettings) => boolean;
}

interface ExplorePanelProps {
  targetUrl: string;
  auditId: string | null;
}

const FOCUS_FLAGS = { trap: false, missingStyle: false, orderMismatch: false };

/** The iframe's rendered box size — what the framed page's own viewport
 * resolves to (nothing overrides it with fixed width/height attrs), so the
 * bbox coordinates the bridge script measures and the server-side evidence
 * capture (contrast-finding route) agree on the same coordinate space. */
export function measureIframeViewport(
  iframe: HTMLIFrameElement | null
): { width: number; height: number } | null {
  if (!iframe) return null;
  const rect = iframe.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { width: Math.round(rect.width), height: Math.round(rect.height) };
}

// A relative path (the bundled demo fixture, e.g. "/explore-demo.html") is
// already same-origin — framing it directly works with no XFO/CSP fight, and
// routing it through /api/preview-proxy would 400 (the proxy's `new URL()`
// call requires an absolute URL). Only an absolute http(s) URL — a real
// audited page — needs the proxy's server-side fetch + bridge injection.
function resolveIframeSrc(targetUrl: string): string {
  if (targetUrl.startsWith("/")) return targetUrl;
  return `/api/preview-proxy?url=${encodeURIComponent(targetUrl)}`;
}

export function ExplorePanel({ targetUrl, auditId }: ExplorePanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [pickerActive, setPickerActive] = useState(true);
  const [pickerDisabled, setPickerDisabled] = useState(false);
  const [hoverBox, setHoverBox] = useState<Bbox | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [picked, setPicked] = useState<InspectedElement | null>(null);
  const [pickedViewport, setPickedViewport] = useState<{ width: number; height: number } | null>(null);

  const [steps, setSteps] = useState<KeyboardStep[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [cvd, setCvd] = useState<CvdType | null>(null);
  const [cvdFlags, setCvdFlags] = useState<CvdFlag[]>([]);

  const [axSnapshot, setAxSnapshot] = useState<AxSnapshot | null>(null);
  const [axLoading, setAxLoading] = useState(true);
  const [axError, setAxError] = useState<string | null>(null);

  const [orientation, setOrientation] = useState<Orientation>("landscape");

  const getBridge = useCallback((): AbleBridge | null => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return null;
    return (win as unknown as { __ableInspect?: AbleBridge }).__ableInspect ?? null;
  }, []);

  const handleLoad = useCallback(() => {
    // Same-origin fixture exposes __ableInspect; cross-origin does not.
    setPickerDisabled(!getBridge());
  }, [getBridge]);

  const handlePointerMove = useCallback(
    (x: number, y: number) => {
      const el = getBridge()?.inspect(x, y) ?? null;
      if (el) {
        setHoverBox(el.bbox);
        setHoverLabel(el.name ? `${el.role}: ${el.name}` : el.role);
      } else {
        setHoverBox(null);
        setHoverLabel(null);
      }
    },
    [getBridge]
  );

  const handlePick = useCallback(
    (x: number, y: number) => {
      const el = getBridge()?.inspect(x, y) ?? null;
      setPicked(el);
      setPickedViewport(measureIframeViewport(iframeRef.current));
      if (el) {
        getBridge()?.highlight(el.selector);
      }
    },
    [getBridge]
  );

  const handleApplyFix = useCallback(
    (selector: string, color: string) => {
      const ok = getBridge()?.patch(selector, { color }) ?? false;
      if (ok) {
        // Re-inspect the patched element to refresh the live contrast meter.
        setPicked((prev) => {
          if (!prev) return prev;
          const re = getBridge()?.inspect(
            prev.bbox.x + Math.max(1, prev.bbox.width / 2),
            prev.bbox.y + Math.max(1, prev.bbox.height / 2)
          );
          return re ?? prev;
        });
      }
    },
    [getBridge]
  );

  const loadFocusables = useCallback(() => {
    const items = getBridge()?.focusables() ?? [];
    setSteps(items);
    setCurrent(0);
    if (items.length > 0) {
      getBridge()?.focusEl(items[0].selector);
    }
  }, [getBridge]);

  const stepTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= steps.length) return;
      setCurrent(index);
      getBridge()?.focusEl(steps[index].selector);
      getBridge()?.highlight(steps[index].selector);
    },
    [steps, getBridge]
  );

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCurrent((prev) => {
        const next = prev + 1 >= steps.length ? 0 : prev + 1;
        if (steps[next]) {
          getBridge()?.focusEl(steps[next].selector);
        }
        return next;
      });
    }, 700);
    return () => clearInterval(id);
  }, [playing, steps, getBridge]);

  const handleCvdChange = useCallback(
    (t: CvdType | null) => {
      setCvd(t);
      if (!t) {
        getBridge()?.setFilter("");
        setCvdFlags([]);
        return;
      }
      getBridge()?.setFilter(CVD_FILTERS[t]);
      const pairs = getBridge()?.contrastPairs() ?? [];
      setCvdFlags(
        flagCvdFailures(
          pairs.map((p) => ({ fg: p.fg, bg: p.bg })),
          t
        )
      );
    },
    [getBridge]
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/explore/ax-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl }),
    })
      .then(async (res) => {
        // res.ok must be checked BEFORE parsing: a platform-level function
        // crash/timeout (e.g. Chromium failing to launch on a constrained
        // serverless runtime) returns a non-JSON error page, not this
        // route's own JSON error shape — parsing that unconditionally threw
        // a raw "Unexpected token..." message straight into the UI.
        if (!res.ok) {
          const message = await res
            .json()
            .then((j) => j.error)
            .catch(() => null);
          throw new Error(message || `Snapshot failed (${res.status})`);
        }
        return res.json().catch(() => {
          throw new Error("Snapshot failed (invalid response)");
        });
      })
      .then((json) => {
        if (!cancelled) setAxSnapshot(json.snapshot ?? null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setAxError(e instanceof Error ? e.message : "Snapshot failed");
      })
      .finally(() => {
        if (!cancelled) setAxLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetUrl]);

  const handleSelectNode = useCallback(
    (role: string, name: string) => {
      getBridge()?.highlightByRoleName(role, name);
    },
    [getBridge]
  );

  const handleApplyA11yProfile = useCallback(
    (settings: AccessibilityProfileSettings) => {
      getBridge()?.applyAccessibilityProfile(settings);
    },
    [getBridge]
  );

  return (
    <div className="flex h-full border rounded-lg overflow-hidden bg-background">
      {/* Preview + overlays */}
      <div className="flex-1 relative min-w-0 bg-white">
        {/* Orientation Adjustment is simulated by constraining the preview's
            own container to a phone-portrait aspect ratio — an iframe can't
            truly rotate the target device or its viewport meta. */}
        <div
          className={orientation === "portrait" ? "h-full mx-auto" : "w-full h-full"}
          style={orientation === "portrait" ? { width: 420, maxWidth: "100%" } : undefined}
        >
          <iframe
            ref={iframeRef}
            src={resolveIframeSrc(targetUrl)}
            title="Explore preview"
            sandbox="allow-scripts allow-same-origin allow-forms"
            className={`w-full h-full border-0 ${pickerActive && !pickerDisabled ? "pointer-events-none" : ""}`}
            onLoad={handleLoad}
          />
        </div>

        <AccessibilityOptionsPanel
          onApply={handleApplyA11yProfile}
          orientation={orientation}
          onOrientationChange={setOrientation}
        />

        {/* Picker overlay (captures pointer coords when active) */}
        <ElementPicker
          active={pickerActive}
          disabled={pickerDisabled}
          hoverBox={hoverBox}
          hoverLabel={hoverLabel}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => {
            setHoverBox(null);
            setHoverLabel(null);
          }}
          onClick={handlePick}
        />

        {/* Keyboard focus rings */}
        {steps.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {steps.map((s, i) =>
              s.bbox ? (
                <div
                  key={s.selector}
                  data-testid={`focus-ring-${i}`}
                  className={`absolute border-2 rounded-sm ${
                    i === current ? "border-red-500 bg-red-500/10" : "border-blue-400/70 bg-transparent"
                  }`}
                  style={{
                    left: s.bbox.x,
                    top: s.bbox.y,
                    width: s.bbox.width,
                    height: s.bbox.height,
                  }}
                >
                  <span className="absolute -top-5 left-0 text-xs font-mono font-semibold text-red-600">
                    {i + 1}
                  </span>
                </div>
              ) : null
            )}
          </div>
        )}

        {/* Cross-origin degradation banner */}
        {pickerDisabled && (
          <div className="absolute inset-x-0 bottom-0 p-2 text-center text-xs bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
            This target cannot be inspected in-place (cross-origin).{" "}
            <a href={targetUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Open in new tab
            </a>
            .
          </div>
        )}
      </div>

      {/* Right rail: inspector + tools */}
      <div className="w-[340px] shrink-0 border-l overflow-y-auto bg-muted/10">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
          <span className="text-sm font-semibold">Element Inspector</span>
          <button
            onClick={() => {
              setPickerActive((v) => !v);
              if (pickerActive) {
                setHoverBox(null);
                setHoverLabel(null);
              }
            }}
            className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
          >
            {pickerActive ? "Stop picking" : "Pick element"}
          </button>
        </div>

        <section className="border-b">
          <SectionTitle title="Inspector" />
          <InspectorPanel element={picked} />
        </section>

        <section className="border-b">
          <SectionTitle title="Live contrast" />
          <ContrastFix
            element={picked}
            auditId={auditId}
            pageUrl={targetUrl}
            viewport={pickedViewport}
            onApply={handleApplyFix}
          />
        </section>

        <section className="border-b">
          <SectionTitle title="Keyboard replay" action={<button onClick={loadFocusables} className="text-xs text-primary hover:underline">Scan focusables</button>} />
          <KeyboardReplay
            steps={steps}
            current={current}
            playing={playing}
            focusTrap={FOCUS_FLAGS.trap}
            missingFocusStyle={FOCUS_FLAGS.missingStyle}
            tabOrderMismatch={FOCUS_FLAGS.orderMismatch}
            onPlayPause={() => setPlaying((v) => !v)}
            onStep={stepTo}
          />
        </section>

        <section className="border-b">
          <SectionTitle title="Color-blind simulation" />
          <CvdOverlay type={cvd} flags={cvdFlags} onChange={handleCvdChange} />
        </section>

        <section>
          <SectionTitle title="Accessibility tree" />
          <AxTreePanel
            snapshot={axSnapshot}
            loading={axLoading}
            error={axError}
            onSelectNode={handleSelectNode}
          />
        </section>
      </div>
    </div>
  );
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {action}
    </div>
  );
}
