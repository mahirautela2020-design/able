import { useCallback, useRef } from "react";
import {
  AccessibilityOptionsPanel,
  type AccessibilityProfileSettings,
  type Orientation,
} from "@/components/workbench/explore/accessibility-options";
import { callTab } from "../lib/tab-bridge";

/**
 * The REAL AccessibilityOptionsPanel component (same one the workbench's
 * "Accessibility" left-column tab renders, variant="inline") -- not a
 * trimmed re-implementation. Full feature set: profiles, color, text,
 * content, accessibility aids, voice support, and the in-widget screen
 * reader toggle all come along for free since it is the literal same
 * component; only the plumbing underneath (onApply/onScroll/onGetPageText)
 * is extension-specific, wired through content-script messaging instead of
 * postMessage to a same-origin iframe.
 */
export function AccessibilityTab() {
  const pageTextRef = useRef("");

  const handleApply = useCallback((settings: AccessibilityProfileSettings) => {
    callTab("apply-a11y-profile", { settings }).catch((e) => {
      console.error("[ScanA11y] apply-a11y-profile failed:", e);
    });
  }, []);

  const handleScroll = useCallback((direction: "up" | "down") => {
    callTab("scroll", { direction }).catch(() => {});
  }, []);

  // ScreenReaderToggle's onGetPageText is called synchronously, but a
  // cross-context page read is inherently async -- refresh a cached copy
  // whenever the tab mounts/refocuses, and hand back that cache.
  const handleGetPageText = useCallback(() => {
    callTab<string>("get-page-text")
      .then((text) => {
        pageTextRef.current = text;
      })
      .catch(() => {});
    return pageTextRef.current;
  }, []);

  return (
    <div className="rounded-lg border">
      <AccessibilityOptionsPanel
        variant="inline"
        onApply={handleApply}
        orientation={"landscape" as Orientation}
        onOrientationChange={() => {}}
        onScroll={handleScroll}
        onGetPageText={handleGetPageText}
      />
    </div>
  );
}
