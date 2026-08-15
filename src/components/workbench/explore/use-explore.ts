"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
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
import type { AccessibilityProfileSettings } from "./accessibility-options";

/** The bridge object a proxied/same-origin preview exposes on its
 * contentWindow (`__ableInspect`). Same surface ExplorePanel uses. */
export interface AbleBridge {
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

const FOCUS_FLAGS = { trap: false, missingStyle: false, orderMismatch: false };

/** The iframe's rendered box size — the coordinate space the bridge's bbox
 * measurements and the server-side evidence capture agree on. */
export function measureIframeViewport(
  iframe: HTMLIFrameElement | null
): { width: number; height: number } | null {
  if (!iframe) return null;
  const rect = iframe.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { width: Math.round(rect.width), height: Math.round(rect.height) };
}

interface UseExploreArgs {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  targetUrl: string;
  auditId: string | null;
  /** Skip the ax-snapshot fetch until the consumer actually needs it (e.g.
   * the Inspect tab is opened) — avoids launching Chromium for every audit
   * view. */
  enabled?: boolean;
}

/**
 * All Inspect-mode state + handlers, extracted so the preview iframe (right
 * column) and the inspector rail (left column) can share one bridge. Mirrors
 * the logic previously inlined in ExplorePanel.
 */
export function useExplore({ iframeRef, targetUrl, auditId, enabled = true }: UseExploreArgs) {
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

  const fetchedRef = useRef(false);

  const getBridge = useCallback((): AbleBridge | null => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return null;
    return (win as unknown as { __ableInspect?: AbleBridge }).__ableInspect ?? null;
  }, [iframeRef]);

  const handleLoad = useCallback(() => {
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
      if (el) getBridge()?.highlight(el.selector);
    },
    [getBridge, iframeRef]
  );

  const handleApplyFix = useCallback(
    (selector: string, color: string) => {
      const ok = getBridge()?.patch(selector, { color }) ?? false;
      if (ok) {
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
    if (items.length > 0) getBridge()?.focusEl(items[0].selector);
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
        if (steps[next]) getBridge()?.focusEl(steps[next].selector);
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
      setCvdFlags(flagCvdFailures(pairs.map((p) => ({ fg: p.fg, bg: p.bg })), t));
    },
    [getBridge]
  );

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

  // AX snapshot for the Accessibility tree, fetched once when first enabled.
  useEffect(() => {
    if (!enabled || fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    setAxLoading(true);
    fetch("/api/explore/ax-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl }),
    })
      .then(async (res) => {
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
  }, [enabled, targetUrl]);

  return {
    // picker
    pickerActive,
    setPickerActive,
    pickerDisabled,
    hoverBox,
    hoverLabel,
    setHoverBox,
    setHoverLabel,
    picked,
    pickedViewport,
    // keyboard
    steps,
    current,
    playing,
    setPlaying,
    focusFlags: FOCUS_FLAGS,
    // cvd
    cvd,
    cvdFlags,
    // ax tree
    axSnapshot,
    axLoading,
    axError,
    // audit context
    auditId,
    targetUrl,
    // handlers
    getBridge,
    handleLoad,
    handlePointerMove,
    handlePick,
    handleApplyFix,
    loadFocusables,
    stepTo,
    handleCvdChange,
    handleSelectNode,
    handleApplyA11yProfile,
  };
}

export type ExploreController = ReturnType<typeof useExplore>;
