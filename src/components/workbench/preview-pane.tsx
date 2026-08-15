"use client";

import { useEffect, useState, type RefObject } from "react";
import type { ExploreController } from "./explore/use-explore";
import type { Orientation } from "./explore/accessibility-options";
import { ElementPicker } from "./explore/element-picker";

// A same-origin fixture path frames directly; an absolute http(s) URL goes
// through the proxy (server-side fetch + bridge injection) so the iframe is
// same-origin and __ableInspect is reachable for Inspect / Accessibility.
function resolveIframeSrc(targetUrl: string): string {
  if (targetUrl.startsWith("/")) return targetUrl;
  return `/api/preview-proxy?url=${encodeURIComponent(targetUrl)}`;
}

type Source = "proxy" | "audited" | "faithful";

interface PreviewPaneProps {
  targetUrl: string;
  previewKey: number;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /** Inspect tab active → overlay the element picker + focus rings. */
  interactive: boolean;
  ctrl: ExploreController;
  orientation: Orientation;
  firstScreenshot: string | null;
  frameBlocked: boolean;
}

/**
 * The single, shared right-column preview. Always frames the proxied target
 * (same-origin, bridge-injected) so the Inspect and Accessibility tools can
 * drive it. Offers two alternate read-only views for sites the proxy renders
 * poorly: the audit's captured screenshot, and a faithful "render like a
 * browser" headless snapshot (with a plain message when a site is behind
 * bot-detection that no server-side preview can render).
 */
export function PreviewPane({
  targetUrl,
  previewKey,
  iframeRef,
  interactive,
  ctrl,
  orientation,
  firstScreenshot,
  frameBlocked,
}: PreviewPaneProps) {
  const [source, setSource] = useState<Source>("proxy");
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<"idle" | "loading" | "blocked" | "error">("idle");

  useEffect(() => {
    return () => {
      if (renderUrl) URL.revokeObjectURL(renderUrl);
    };
  }, [renderUrl]);

  async function loadFaithfulRender() {
    setSource("faithful");
    setRenderState("loading");
    try {
      const res = await fetch(`/api/preview-render?url=${encodeURIComponent(targetUrl)}`);
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = await res.json().catch(() => ({}));
        setRenderState(j.blocked ? "blocked" : "error");
        return;
      }
      if (!res.ok) {
        setRenderState("error");
        return;
      }
      const blob = await res.blob();
      setRenderUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setRenderState("idle");
    } catch {
      setRenderState("error");
    }
  }

  const overlayActive = interactive && ctrl.pickerActive && !ctrl.pickerDisabled;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Preview-source toolbar (single row). The "blocks embedding" note
          only shows when the site actually blocks framing. */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b bg-muted/20 text-xs">
        <p className="min-w-0 truncate text-muted-foreground">
          {frameBlocked ? (
            <>
              <span className="font-medium text-amber-700 dark:text-amber-300">{targetUrl}</span>{" "}
              blocks embedding — shown via proxy.
            </>
          ) : (
            <span className="font-medium">Live preview</span>
          )}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setSource("proxy")}
            className={`px-2 py-1 rounded border transition-colors ${
              source === "proxy" ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-accent/50"
            }`}
          >
            Interactive
          </button>
          {firstScreenshot && (
            <button
              onClick={() => setSource("audited")}
              className={`px-2 py-1 rounded border transition-colors ${
                source === "audited" ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-accent/50"
              }`}
            >
              Audited screenshot
            </button>
          )}
          <button
            onClick={() => (source === "faithful" ? setSource("proxy") : loadFaithfulRender())}
            className={`px-2 py-1 rounded border transition-colors ${
              source === "faithful" ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-accent/50"
            }`}
            title="Render the page with a real headless browser (like Claude does)"
          >
            Render like a browser
          </button>
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
          >
            Open live site
          </a>
        </div>
      </div>

      {/* Preview surface */}
      <div className="flex-1 min-h-0 bg-white relative">
        {source === "faithful" ? (
          <div className="absolute inset-0 overflow-auto">
            {renderState === "loading" && (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Rendering a real-browser snapshot…
              </div>
            )}
            {renderState === "blocked" && (
              <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-sm font-medium">Live preview isn&apos;t available for this site</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  <span className="font-medium">{targetUrl}</span> is behind bot-detection (e.g.
                  Cloudflare / Akamai), which blocks every server-side preview — including a real
                  headless browser. This does not affect the audit: results appear in the checklist
                  as pages finish.
                </p>
                <a href={targetUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                  Open the live site in a new tab
                </a>
              </div>
            )}
            {renderState === "error" && (
              <div className="h-full flex items-center justify-center px-6 text-center text-xs text-red-600 dark:text-red-400">
                Couldn&apos;t render a snapshot. Try the interactive preview or open the live site.
              </div>
            )}
            {renderState === "idle" && renderUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={renderUrl} alt={`Real-browser rendered snapshot of ${targetUrl}`} className="w-full" />
            )}
          </div>
        ) : source === "audited" && firstScreenshot ? (
          <div className="absolute inset-0 overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={firstScreenshot}
              alt={`Full-page screenshot of ${targetUrl} captured during audit`}
              className="w-full"
            />
          </div>
        ) : (
          <div
            className={orientation === "portrait" ? "h-full mx-auto relative" : "w-full h-full relative"}
            style={orientation === "portrait" ? { width: 420, maxWidth: "100%" } : undefined}
          >
            <iframe
              key={previewKey}
              ref={iframeRef}
              src={resolveIframeSrc(targetUrl)}
              title={`Live preview of ${targetUrl}`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              className={`w-full h-full border-0 ${overlayActive ? "pointer-events-none" : ""}`}
              onLoad={ctrl.handleLoad}
            />

            {interactive && (
              <ElementPicker
                active={ctrl.pickerActive}
                disabled={ctrl.pickerDisabled}
                hoverBox={ctrl.hoverBox}
                hoverLabel={ctrl.hoverLabel}
                onPointerMove={ctrl.handlePointerMove}
                onPointerLeave={() => {
                  ctrl.setHoverBox(null);
                  ctrl.setHoverLabel(null);
                }}
                onClick={ctrl.handlePick}
              />
            )}

            {interactive && ctrl.steps.length > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                {ctrl.steps.map((s, i) =>
                  s.bbox ? (
                    <div
                      key={s.selector}
                      data-testid={`focus-ring-${i}`}
                      className={`absolute border-2 rounded-sm ${
                        i === ctrl.current
                          ? "border-red-500 bg-red-500/10"
                          : "border-blue-400/70 bg-transparent"
                      }`}
                      style={{ left: s.bbox.x, top: s.bbox.y, width: s.bbox.width, height: s.bbox.height }}
                    >
                      <span className="absolute -top-5 left-0 text-xs font-mono font-semibold text-red-600">
                        {i + 1}
                      </span>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
