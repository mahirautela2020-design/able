"use client";

import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import Link from "next/link";
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

type Source = "proxy" | "faithful";
type ProxyState = "checking" | "ok" | "failed";

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
  editingUrl: boolean;
  setEditingUrl: Dispatch<SetStateAction<boolean>>;
  urlDraft: string;
  setUrlDraft: Dispatch<SetStateAction<string>>;
  rerunning: boolean;
  onSubmitUrl: () => void;
  onReload: () => void;
}

/**
 * The single, shared right-column preview: one navigation row (Back, URL,
 * Open live site, Reload, Render like a browser) plus the preview surface.
 * Always attempts the proxied target first (same-origin, bridge-injected) so
 * the Inspect and Accessibility tools can drive it. When the proxy itself
 * can't render the page (bot-detection, network failure, non-HTML response)
 * a centered message explains why — the audit result is unaffected, only
 * the interactive preview tools are disabled for that state.
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
  editingUrl,
  setEditingUrl,
  urlDraft,
  setUrlDraft,
  rerunning,
  onSubmitUrl,
  onReload,
}: PreviewPaneProps) {
  const [source, setSource] = useState<Source>("proxy");
  const [proxyState, setProxyState] = useState<ProxyState>("checking");
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<"idle" | "loading" | "blocked" | "error">("idle");

  useEffect(() => {
    return () => {
      if (renderUrl) URL.revokeObjectURL(renderUrl);
    };
  }, [renderUrl]);

  // Probe the proxy itself (not just the target's XFO headers) — a site
  // behind bot-detection can make the proxy's own fetch 502/403 even though
  // framing would otherwise be allowed. Only this failure — not frameBlocked
  // (which is informational: the proxy usually renders fine anyway) — should
  // disable interactive tools and show the centered message.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSource("proxy");
      setProxyState("checking");
      try {
        const res = await fetch(resolveIframeSrc(targetUrl), { cache: "no-store" });
        if (cancelled) return;
        setProxyState(res.ok ? "ok" : "failed");
      } catch {
        if (!cancelled) setProxyState("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetUrl, previewKey]);

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

  const proxyFailed = proxyState === "failed";
  const interactiveEnabled = interactive && !proxyFailed;
  const overlayActive = interactiveEnabled && ctrl.pickerActive && !ctrl.pickerDisabled;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Single navigation row. */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b bg-muted/20 text-xs">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link
            href="/"
            className="shrink-0 px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
            title="Back to new audit"
          >
            ← Back
          </Link>

          {editingUrl ? (
            <form
              className="flex items-center gap-1.5 flex-1 min-w-0"
              onSubmit={(e) => {
                e.preventDefault();
                onSubmitUrl();
              }}
            >
              <input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                autoFocus
                className="flex-1 min-w-0 font-mono px-2 py-1 rounded border bg-background focus:outline-none focus:ring-1"
                placeholder="https://example.com"
                aria-label="Edit audit URL"
              />
              <button
                type="submit"
                className="px-2 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90"
              >
                {rerunning ? "Starting…" : "Audit"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingUrl(false);
                  setUrlDraft(targetUrl);
                }}
                className="px-2 py-1 rounded border hover:bg-accent/50"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => setEditingUrl(true)}
              className="group flex items-center gap-1.5 min-w-0 max-w-full"
              title="Click to change URL / re-audit"
            >
              <span className="font-mono text-muted-foreground truncate">{targetUrl}</span>
              <span className="text-[10px] text-muted-foreground/60 group-hover:text-primary shrink-0">
                ✎
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
          >
            Open live site
          </a>
          <button
            onClick={onReload}
            className="px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
          >
            Reload preview
          </button>
          <button
            onClick={() => (source === "faithful" ? setSource("proxy") : loadFaithfulRender())}
            className={`px-2 py-1 rounded border transition-colors ${
              source === "faithful" ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-accent/50"
            }`}
            title="Render the page with a real headless browser (like Claude does)"
          >
            Render like a browser
          </button>
        </div>
      </div>

      {/* Preview surface — any error/status message is centered here, never
          stacked in a second toolbar row. */}
      <div className="flex-1 min-h-0 bg-white relative">
        {source === "faithful" ? (
          <div className="absolute inset-0 overflow-auto">
            {renderState === "loading" && (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Rendering a real-browser snapshot…
              </div>
            )}
            {renderState === "blocked" && (
              <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center animate-in fade-in duration-200 ease-out motion-reduce:animate-none">
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
        ) : proxyFailed && firstScreenshot ? (
          // Proxy couldn't render the page live — fall back to the audit's
          // own captured screenshot rather than a blank/broken iframe.
          <div className="absolute inset-0 overflow-auto">
            <div className="sticky top-0 z-10 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-center text-[11px] text-amber-800 dark:text-amber-300 animate-in fade-in slide-in-from-top-1 duration-200 ease-out motion-reduce:animate-none">
              Live preview isn&apos;t available for this site — showing the screenshot captured
              during the audit instead. Your audit results aren&apos;t affected.
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={firstScreenshot}
              alt={`Full-page screenshot of ${targetUrl} captured during audit`}
              className="w-full"
            />
          </div>
        ) : proxyFailed ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center animate-in fade-in duration-200 ease-out motion-reduce:animate-none">
            <p className="text-sm font-medium">Preview isn&apos;t available for this site right now</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              <span className="font-medium">{targetUrl}</span> couldn&apos;t be rendered here — likely
              bot-detection or a network block on the live preview. This does not affect the audit:
              results still appear in the checklist as pages finish. Inspect and Accessibility tools
              are unavailable for this preview until it loads.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={loadFaithfulRender}
                className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
              >
                Try render like a browser
              </button>
              <a href={targetUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                Open the live site
              </a>
            </div>
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

            {frameBlocked && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-black/60 text-white text-[11px] whitespace-nowrap animate-in fade-in slide-in-from-top-1 duration-200 ease-out motion-reduce:animate-none">
                {targetUrl} blocks direct embedding — shown via proxy
              </div>
            )}

            {interactiveEnabled && (
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

            {interactiveEnabled && ctrl.steps.length > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                {ctrl.steps.map((s, i) =>
                  s.bbox ? (
                    <div
                      key={s.selector}
                      data-testid={`focus-ring-${i}`}
                      // Glides between steps instead of teleporting — this
                      // ring IS the tool's demonstration of tab order, so
                      // showing the path between elements reinforces what's
                      // being tested, not just decoration.
                      className={`absolute border-2 rounded-sm transition-all duration-200 ease-out motion-reduce:transition-none ${
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
