"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getWcagRegistry, type WcagSuccessCriterion } from "@/engine/wcag-registry";
import { supabase, authHeaders } from "@/lib/supabase/client";
import { ScreenReaderPanel } from "@/components/workbench/explore/screen-reader-panel";
import { PreviewPane } from "@/components/workbench/preview-pane";
import { InspectRail } from "@/components/workbench/explore/inspect-rail";
import { useExplore } from "@/components/workbench/explore/use-explore";
import {
  AccessibilityOptionsPanel,
  type Orientation,
} from "@/components/workbench/explore/accessibility-options";

type WorkbenchTab = "checklist" | "inspect" | "screen-reader" | "a11y";

export interface WorkbenchFinding {
  id: string;
  bucket: string;
  rule_id: string;
  rule_title: string;
  wcag_criterion: string | null;
  wcag_level: string | null;
  principle: string | null;
  severity: string;
  selector: string | null;
  failure_summary: string;
  screenshot_crop_url: string | null;
  full_screenshot_url: string | null;
}

interface WorkbenchProps {
  auditId: string;
  targetUrl: string;
  auditStatus: string;
  findings: WorkbenchFinding[];
}

export const PRINCIPLES = [
  { key: "1", label: "1. Perceivable", principleName: "Perceivable" },
  { key: "2", label: "2. Operable", principleName: "Operable" },
  { key: "3", label: "3. Understandable", principleName: "Understandable" },
  { key: "4", label: "4. Robust", principleName: "Robust" },
] as const;

type LevelFilter = "ALL" | "A" | "AA" | "AAA";

// wcag-registry.ts stores `principle` as the full word (e.g. "Perceivable"),
// while the checklist tabs key off the numeric PRINCIPLES id — map through
// principleName rather than comparing the two directly.
export function filterScsByPrinciple<T extends { sc: WcagSuccessCriterion }>(
  scList: T[],
  principleKey: string,
  levelFilter: LevelFilter
): T[] {
  const principleName = PRINCIPLES.find((p) => p.key === principleKey)?.principleName;
  return scList.filter((s) => {
    if (s.sc.principle !== principleName) return false;
    if (levelFilter !== "ALL" && s.sc.level !== levelFilter) return false;
    return true;
  });
}

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  serious: "bg-orange-500",
  moderate: "bg-yellow-500",
  minor: "bg-blue-500",
};

/**
 * Two-column workbench (Claude/Figma-Make style):
 *  - LEFT: WCAG 2.2 checklist grouped by principle — status per SC,
 *    click an SC to filter findings, "run focused check" affordance.
 *  - RIGHT: live interactive preview of the audited URL in a sandboxed
 *    iframe, with a findings drawer for the selected SC.
 */
export function Workbench({ auditId, targetUrl, auditStatus, findings }: WorkbenchProps) {
  const router = useRouter();
  const [activeSc, setActiveSc] = useState<string | null>(null);
  const [collapsedPrinciples, setCollapsedPrinciples] = useState<Set<string>>(new Set());
  const [levelFilter, setLevelFilter] = useState<"ALL" | "A" | "AA" | "AAA">("ALL");
  const [previewKey, setPreviewKey] = useState(0); // reload iframe
  const [frameBlocked, setFrameBlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("checklist");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [hasDownloadedPdf, setHasDownloadedPdf] = useState(false);
  const [rerunWarning, setRerunWarning] = useState<{ urlOverride?: string } | null>(null);
  const [rerunWarningDownloadFailed, setRerunWarningDownloadFailed] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(targetUrl);
  const [rerunning, setRerunning] = useState(false);
  const [now, setNow] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [liveFindings, setLiveFindings] = useState<WorkbenchFinding[]>(findings);
  const [status, setStatus] = useState(auditStatus);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, unknown> | null>(null);
  const [stopping, setStopping] = useState(false);

  // Full WCAG 2.2 registry (86 SCs) — the checklist the user sees.
  const registry = useMemo(() => getWcagRegistry(), []);

  // Shared Inspect/Accessibility controller — drives the single preview
  // iframe (right column) so the left-column tools can act on it.
  const ctrl = useExplore({
    iframeRef,
    targetUrl,
    auditId,
    enabled: activeTab === "inspect",
  });

  // Live-poll while the audit is queued/running so the checklist fills in
  // as pages finish. Stops once complete/failed. Also ticks the clock so
  // the ETA stays fresh (async context — legal setState).
  useEffect(() => {
    if (status !== "queued" && status !== "running") return;
    let stopped = false;

    const tick = async () => {
      setNow(Date.now());
      setStartedAt((prev) => (prev === 0 ? Date.now() : prev));
      try {
        // Send the session token when available so logged-in users always
        // pass the owner check (works on localhost where no x-forwarded-for
        // exists, and on prod). Anonymous users fall back to IP matching.
        const headers = await authHeaders();
        const res = await fetch(`/api/audits/${auditId}/report`, { headers });
        if (!res.ok) return;
        const json = await res.json();
        if (stopped) return;
        setStatus(json.audit?.status ?? status);
        setErrorCode(json.audit?.error_code ?? null);
        setProgress(json.audit?.progress ?? null);
        if (Array.isArray(json.findings)) setLiveFindings(json.findings);
      } catch {
        // transient — keep polling
      }
    };

    tick();
    const interval = setInterval(tick, 4000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [auditId, status]);

  const bySc = useMemo(() => {
    const map = new Map<string, WorkbenchFinding[]>();
    for (const f of liveFindings) {
      const sc = f.wcag_criterion || "best-practice";
      const arr = map.get(sc) || [];
      arr.push(f);
      map.set(sc, arr);
    }
    return map;
  }, [liveFindings]);

  const scList = useMemo(() => {
    type Status = "fail" | "needs_review" | "pass" | "manual";
    const bySc = new Map<string, WorkbenchFinding[]>();
    for (const f of liveFindings) {
      const sc = f.wcag_criterion || "best-practice";
      const arr = bySc.get(sc) || [];
      arr.push(f);
      bySc.set(sc, arr);
    }

    const rows: {
      sc: WcagSuccessCriterion;
      count: number;
      worst: string;
      status: Status;
    }[] = [];

    for (const sc of registry) {
      const fs = bySc.get(sc.id) || [];
      const hasHard = fs.some(
        (f) => f.bucket === "violation" || f.severity === "critical" || f.severity === "serious"
      );
      const worst =
        fs.find((f) => f.severity === "critical")?.severity ||
        fs.find((f) => f.severity === "serious")?.severity ||
        fs.find((f) => f.severity === "moderate")?.severity ||
        "minor";

      let status: Status;
      if (fs.length === 0) {
        status = sc.manualTest ? "manual" : "pass";
      } else if (hasHard || fs.some((f) => f.bucket !== "needs_review")) {
        status = "fail";
      } else {
        status = "needs_review";
      }

      rows.push({ sc, count: fs.length, worst, status });
    }

    return rows;
  }, [liveFindings, registry]);

  const principleGroups = useMemo(
    () =>
      PRINCIPLES.map((p) => ({
        principle: p,
        scs: filterScsByPrinciple(scList, p.key, levelFilter),
      })),
    [scList, levelFilter]
  );

  const activeFindings = activeSc ? bySc.get(activeSc) || [] : [];

  // Server-side embedding check: the browser can't reliably detect
  // X-Frame-Options from a cross-origin iframe (every external site throws
  // on contentWindow access), so we ask the API for the real headers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Reset per target/preview reload (async context — legal setState).
        setFrameBlocked(false);
        const res = await fetch(`/api/preview-check?url=${encodeURIComponent(targetUrl)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.blocked) setFrameBlocked(true);
      } catch {
        // check failed — leave the iframe up
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetUrl, previewKey]);

  // First available full-page screenshot (captured during the audit) —
  // used as the preview when the site blocks iframing.
  const firstScreenshot = useMemo(
    () => liveFindings.find((f) => f.full_screenshot_url)?.full_screenshot_url ?? null,
    [liveFindings]
  );

  // ETA: per-page rate × remaining pages. Only when we have real progress.
  const etaSeconds = useMemo(() => {
    if (
      status !== "running" ||
      !progress ||
      typeof progress.pagesDone !== "number" ||
      typeof progress.pagesTotal !== "number" ||
      progress.pagesDone < 1
    ) {
      return null;
    }
    const elapsed = (now - startedAt) / 1000;
    const perPage = elapsed / progress.pagesDone;
    const remaining = progress.pagesTotal - progress.pagesDone;
    return Math.max(5, Math.round(perPage * remaining));
  }, [status, progress, now, startedAt]);

  const percentComplete = useMemo(() => {
    if (
      !progress ||
      typeof progress.pagesDone !== "number" ||
      typeof progress.pagesTotal !== "number" ||
      progress.pagesTotal < 1
    ) {
      return null;
    }
    return Math.min(100, Math.round((progress.pagesDone / progress.pagesTotal) * 100));
  }, [progress]);

  /** Download the 16:9 PDF with the session token (endpoint is auth-gated).
   * Returns whether the download actually succeeded, so callers that only
   * want to proceed (e.g. the rerun-warning modal) don't act on a silent
   * failure. */
  async function handleDownloadPdf(): Promise<boolean> {
    setDownloadingPdf(true);
    try {
      const {
        data: { session },
      } = await (supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }));
      const res = await fetch(`/api/audits/${auditId}/pdf`, {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) throw new Error(`PDF request failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scana11y-report-${auditId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setHasDownloadedPdf(true);
      return true;
    } catch (e) {
      console.error("PDF download failed:", e);
      return false;
    } finally {
      setDownloadingPdf(false);
    }
  }

  // Gate in front of handleRerun: a completed audit's results are only
  // reachable by revisiting this exact URL — starting a new audit doesn't
  // delete anything, but the user can lose track of it. Skipped once
  // they've downloaded a PDF, or if there's nothing finished to lose yet.
  function requestRerun(urlOverride?: string) {
    if (status === "complete" && !hasDownloadedPdf) {
      setRerunWarningDownloadFailed(false);
      setRerunWarning({ urlOverride });
      return;
    }
    handleRerun(urlOverride);
  }

  // Re-run: POST the same (or edited) URL to start a fresh audit, then
  // navigate to its workbench.
  async function handleRerun(urlOverride?: string) {
    if (rerunning) return;
    const url = (urlOverride || urlDraft || targetUrl).trim();
    if (!url) return;
    setRerunning(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("Failed to start audit");
      const json = await res.json();
      const newId = json.id;
      router.push(`/workbench/${newId}`);
    } catch (e) {
      console.error("Rerun failed:", e);
      setRerunning(false);
    }
  }

  // Stop a queued/running audit. The server marks it failed/CANCELLED and the
  // scan pipeline bails between pages; we optimistically reflect that here so
  // the UI updates immediately (polling would otherwise catch it next tick).
  async function handleStop() {
    if (stopping) return;
    setStopping(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/audits/${auditId}/cancel`, { method: "POST", headers });
      if (res.ok) {
        setStatus("failed");
        setErrorCode("CANCELLED");
      }
    } catch (e) {
      console.error("Stop failed:", e);
    } finally {
      setStopping(false);
    }
  }

  return (
    <div className="relative flex h-full border rounded-lg overflow-hidden bg-background">
      {/* ── LEFT: WCAG checklist ── */}
      <aside className="w-[320px] shrink-0 border-r flex flex-col bg-muted/20">
        <div className="p-3 border-b">
          <h2 className="text-sm font-semibold">Accessibility Checklist</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {liveFindings.length} findings · {bySc.size} criteria affected
            {progress && typeof progress.pagesDone === "number" && typeof progress.pagesTotal === "number"
              ? ` · ${progress.pagesDone}/${progress.pagesTotal} pages`
              : ""}
          </p>
        </div>

        {/* Audit status + progress + ETA (left column) */}
        <div className="p-3 border-b bg-background/50 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {status === "running" || status === "queued" ? (
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              ) : status === "complete" ? (
                <span className="h-2 w-2 rounded-full bg-green-500" />
              ) : status === "failed" && errorCode === "CANCELLED" ? (
                <span className="h-2 w-2 rounded-full bg-amber-500" />
              ) : status === "failed" ? (
                <span className="h-2 w-2 rounded-full bg-red-500" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
              )}
              <span className="text-xs font-semibold">
                {auditStatusLabel(status, errorCode)}
              </span>
            </div>
            {(status === "running" || status === "queued") && (
              <button
                onClick={handleStop}
                disabled={stopping}
                className="text-[11px] px-2 py-0.5 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
              >
                {stopping ? "Stopping…" : "Stop"}
              </button>
            )}
            {status === "failed" && (
              <button
                onClick={() => handleRerun()}
                disabled={rerunning}
                className="text-[11px] px-2 py-0.5 rounded border hover:bg-accent/50 transition-colors disabled:opacity-50"
              >
                {rerunning ? "Starting…" : "Retry"}
              </button>
            )}
          </div>

          {/* Progress bar */}
          {status === "running" &&
            progress &&
            typeof progress.pagesDone === "number" &&
            typeof progress.pagesTotal === "number" && (
              <>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        (progress.pagesDone / Math.max(1, progress.pagesTotal)) * 100
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {progress.pagesDone >= 1
                    ? `${percentComplete ?? 0}% · Scanning page ${progress.pagesDone} of ${progress.pagesTotal}${
                        etaSeconds !== null ? ` · ${formatEta(etaSeconds)}` : ""
                      }`
                    : "Starting…"}
                </p>
              </>
            )}
          {status === "queued" && (
            <p className="text-[11px] text-muted-foreground">Waiting to start…</p>
          )}
          {status === "complete" && (
            <p className="text-[11px] text-green-600 dark:text-green-400">
              Audit complete — {liveFindings.length} findings across {bySc.size} criteria.
            </p>
          )}
          {status === "failed" && errorCode === "CANCELLED" && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Audit stopped. Any pages already scanned are shown below — or retry.
            </p>
          )}
          {status === "failed" && errorCode !== "CANCELLED" && (
            <p className="text-[11px] text-red-600 dark:text-red-400">
              Audit failed. Check the pages below or retry.
            </p>
          )}
        </div>

        {/* Tab nav — each tab renders its content in THIS left column; the
            right column always shows the shared live preview. */}
        <div className="flex border-b text-xs">
          {(
            [
              { key: "checklist", label: "Checklist" },
              { key: "inspect", label: "Inspect" },
              { key: "screen-reader", label: "Screen Reader" },
              { key: "a11y", label: "Accessibility" },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => setActiveTab(m.key)}
              className={`flex-1 py-2 px-1 font-medium transition-colors ${
                activeTab === m.key
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {activeTab === "checklist" && (
        <>
        {/* Level filter: which standard/conformance level to show */}
        <div className="flex border-b text-[11px]">
          {(["ALL", "A", "AA", "AAA"] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`flex-1 py-1.5 font-medium transition-colors ${
                levelFilter === lvl
                  ? "text-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {lvl === "ALL" ? "All levels" : lvl}
            </button>
          ))}
        </div>

        {/* Checklist grouped by principle — always-visible labeled sections
            (previously four unlabeled "1"/"2"/"3"/"4" tabs that only showed
            which principle you were looking at after you'd already clicked
            one). Collapsible per section, all expanded by default. */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {principleGroups.map(({ principle, scs }) => {
            const isCollapsed = collapsedPrinciples.has(principle.key);
            return (
              <div key={principle.key} className="border rounded-md overflow-hidden">
                <button
                  onClick={() =>
                    setCollapsedPrinciples((prev) => {
                      const next = new Set(prev);
                      if (next.has(principle.key)) next.delete(principle.key);
                      else next.add(principle.key);
                      return next;
                    })
                  }
                  aria-expanded={!isCollapsed}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  <span>{principle.label}</span>
                  <span className="text-muted-foreground font-normal">
                    {scs.length} {isCollapsed ? "▸" : "▾"}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="p-2 space-y-1">
                    {scs.length === 0 && (
                      <p className="text-xs text-muted-foreground p-2">
                        No criteria under this level.
                      </p>
                    )}
                    {scs.map(({ sc, count, status }) => (
            <button
              key={sc.id}
              onClick={() => setActiveSc(activeSc === sc.id ? null : sc.id)}
              className={`w-full text-left p-2 rounded-md border transition-colors ${
                activeSc === sc.id
                  ? "bg-accent border-primary/40"
                  : "hover:bg-accent/50 border-transparent"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-medium">{sc.id}</span>
                <div className="flex items-center gap-1.5">
                  <StatusDot status={status} />
                  {count > 0 && (
                    <span className="text-xs text-muted-foreground">{count}</span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {sc.name}
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                {statusLabel(status)}
                {sc.manualTest ? " · manual" : ""} · {sc.level}
              </p>
            </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Focused check affordance */}
        <div className="p-3 border-t">
          <button
            onClick={() => setActiveSc(null)}
            className="w-full text-xs py-1.5 rounded-md border hover:bg-accent/50 transition-colors"
          >
            Clear selection
          </button>
        </div>
        </>
        )}

        {activeTab === "inspect" && (
          <div className="flex-1 min-h-0">
            <InspectRail ctrl={ctrl} />
          </div>
        )}
        {activeTab === "screen-reader" && (
          <div className="flex-1 min-h-0">
            <ScreenReaderPanel auditId={auditId} />
          </div>
        )}
        {activeTab === "a11y" && (
          <div className="flex-1 min-h-0">
            <AccessibilityOptionsPanel
              variant="inline"
              onApply={ctrl.handleApplyA11yProfile}
              orientation={orientation}
              onOrientationChange={setOrientation}
            />
          </div>
        )}
      </aside>

      {/* ── RIGHT: live preview + findings ── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* URL row — actions live here ONLY (progress lives in the left column) */}
        <div className="px-3 py-2 border-b bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Back to start */}
            <Link
              href="/"
              className="shrink-0 text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
              title="Back to new audit"
            >
              ← Back
            </Link>

            {/* URL: display or editable */}
            {editingUrl ? (
              <form
                className="flex items-center gap-1.5 flex-1 min-w-0"
                onSubmit={(e) => {
                  e.preventDefault();
                  setEditingUrl(false);
                  if (urlDraft.trim() !== targetUrl) requestRerun();
                }}
              >
                <input
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  autoFocus
                  className="flex-1 min-w-0 text-xs font-mono px-2 py-1 rounded border bg-background focus:outline-none focus:ring-1"
                  placeholder="https://example.com"
                  aria-label="Edit audit URL"
                />
                <button
                  type="submit"
                  className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                >
                  {rerunning ? "Starting…" : "Audit"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingUrl(false);
                    setUrlDraft(targetUrl);
                  }}
                  className="text-xs px-2 py-1 rounded border hover:bg-accent/50"
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
                <span className="text-xs font-mono text-muted-foreground truncate">
                  {targetUrl}
                </span>
                <span className="text-[10px] text-muted-foreground/60 group-hover:text-primary shrink-0">
                  ✎
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
            >
              Open live site
            </a>
            <button
              onClick={() => setPreviewKey((k) => k + 1)}
              className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
            >
              Reload preview
            </button>
            {/* Re-run always available (esp. after a failure) */}
            <button
              onClick={() => requestRerun()}
              disabled={rerunning || status === "running" || status === "queued"}
              className="text-xs px-2.5 py-1 rounded-md border hover:bg-accent/50 transition-colors disabled:opacity-50"
            >
              {rerunning ? "Starting…" : "Re-run"}
            </button>
            {status === "complete" && (
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="text-xs px-2.5 py-1 rounded-md border hover:bg-accent/50 transition-colors disabled:opacity-50"
              >
                {downloadingPdf ? "Preparing…" : "Download PDF"}
              </button>
            )}
          </div>
        </div>

        <PreviewPane
          targetUrl={targetUrl}
          previewKey={previewKey}
          iframeRef={iframeRef}
          interactive={activeTab === "inspect"}
          ctrl={ctrl}
          orientation={orientation}
          firstScreenshot={firstScreenshot}
          frameBlocked={frameBlocked}
        />

        {/* Findings drawer for selected SC */}
        {activeSc && (
          <div className="h-48 border-t overflow-y-auto p-3 bg-muted/10">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">
                Findings for {activeSc}
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  {activeFindings.length} total
                </span>
              </h3>
              <button
                onClick={() => setActiveSc(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-2">
              {activeFindings.map((f) => (
                <Card key={f.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[f.severity] || "bg-gray-400"}`} />
                      <span className="text-xs font-medium">{f.rule_title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {f.bucket}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {f.failure_summary}
                    </p>
                    {f.selector && (
                      <p className="text-[10px] font-mono text-muted-foreground mt-1 truncate">
                        {f.selector}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
              {activeFindings.length === 0 && (
                <p className="text-xs text-muted-foreground">No findings for this criterion.</p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Warn before a completed audit's results become hard to find again
          (starting a new audit doesn't delete anything, but only this
          audit's own URL can get back to it). Skipped once a PDF has been
          downloaded this session, or for an in-progress/failed audit. */}
      {rerunWarning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card className="w-80">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">Download this report before starting a new audit?</p>
              <p className="text-xs text-muted-foreground">
                This audit&apos;s results aren&apos;t deleted, but you&apos;ll need this page&apos;s link to
                see them again once a new audit replaces it here.
              </p>
              {rerunWarningDownloadFailed && (
                <p className="text-xs text-red-600">Download failed — try again, or continue without it.</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setRerunWarning(null)}
                  disabled={downloadingPdf || rerunning}
                  className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const { urlOverride } = rerunWarning;
                    const downloaded = await handleDownloadPdf();
                    if (!downloaded) {
                      setRerunWarningDownloadFailed(true);
                      return;
                    }
                    setRerunWarning(null);
                    setRerunWarningDownloadFailed(false);
                    handleRerun(urlOverride);
                  }}
                  disabled={downloadingPdf || rerunning}
                  className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors disabled:opacity-50"
                >
                  {downloadingPdf ? "Preparing…" : "Download PDF"}
                </button>
                <button
                  onClick={() => {
                    const { urlOverride } = rerunWarning;
                    setRerunWarning(null);
                    setRerunWarningDownloadFailed(false);
                    handleRerun(urlOverride);
                  }}
                  disabled={downloadingPdf || rerunning}
                  className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Continue anyway
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  fail: "bg-red-500",
  needs_review: "bg-amber-500",
  pass: "bg-emerald-500",
  manual: "bg-slate-400",
};

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`w-2 h-2 rounded-full ${STATUS_STYLE[status] || "bg-slate-400"}`}
      aria-label={statusLabel(status)}
      title={statusLabel(status)}
    />
  );
}

/** Formats a whole number of seconds as a minute-scale ETA string. */
export function formatEta(seconds: number): string {
  if (seconds < 60) return "<1 min left";
  const minutes = Math.round(seconds / 60);
  return `~${minutes} min left`;
}

/** Human label for the AUDIT lifecycle status (distinct from per-SC finding
 * status). A failed audit carrying error_code "CANCELLED" reads as "Stopped". */
export function auditStatusLabel(status: string, errorCode?: string | null): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "complete":
      return "Completed";
    case "failed":
      return errorCode === "CANCELLED" ? "Stopped" : "Failed";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "fail":
      return "Fails";
    case "needs_review":
      return "Needs review";
    case "pass":
      return "Pass";
    case "manual":
      return "Manual check";
    default:
      return status;
  }
}
