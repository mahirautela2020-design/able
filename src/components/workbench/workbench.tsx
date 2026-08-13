"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getWcagRegistry, type WcagSuccessCriterion } from "@/engine/wcag-registry";
import { supabase } from "@/lib/supabase/client";

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

const PRINCIPLES = [
  { key: "1", label: "1. Perceivable" },
  { key: "2", label: "2. Operable" },
  { key: "3", label: "3. Understandable" },
  { key: "4", label: "4. Robust" },
] as const;

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
  const [activeSc, setActiveSc] = useState<string | null>(null);
  const [activePrinciple, setActivePrinciple] = useState<string>("1");
  const [levelFilter, setLevelFilter] = useState<"ALL" | "A" | "AA" | "AAA">("ALL");
  const [previewKey, setPreviewKey] = useState(0); // reload iframe
  const [frameBlocked, setFrameBlocked] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [now, setNow] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [liveFindings, setLiveFindings] = useState<WorkbenchFinding[]>(findings);
  const [status, setStatus] = useState(auditStatus);
  const [progress, setProgress] = useState<Record<string, unknown> | null>(null);

  // Full WCAG 2.2 registry (86 SCs) — the checklist the user sees.
  const registry = useMemo(() => getWcagRegistry(), []);

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
        const res = await fetch(`/api/audits/${auditId}/report`);
        if (!res.ok) return;
        const json = await res.json();
        if (stopped) return;
        setStatus(json.audit?.status ?? status);
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

  const principleScs = scList.filter((s) => {
    if (s.sc.principle !== activePrinciple) return false;
    if (levelFilter !== "ALL" && s.sc.level !== levelFilter) return false;
    return true;
  });

  const activeFindings = activeSc ? bySc.get(activeSc) || [] : [];

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

  /** Download the 16:9 PDF with the session token (endpoint is auth-gated). */
  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
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
    } catch (e) {
      console.error("PDF download failed:", e);
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="flex h-full border rounded-lg overflow-hidden bg-background">
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

        {/* Principle tabs */}
        <div className="flex border-b text-xs">
          {PRINCIPLES.map((p) => (
            <button
              key={p.key}
              onClick={() => setActivePrinciple(p.key)}
              className={`flex-1 py-2 px-1 font-medium transition-colors ${
                activePrinciple === p.key
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.key}
            </button>
          ))}
        </div>

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

        {/* SC list for the active principle + level */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {principleScs.length === 0 && (
            <p className="text-xs text-muted-foreground p-3">
              No criteria under this principle and level.
            </p>
          )}
          {principleScs.map(({ sc, count, status }) => (
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

        {/* Focused check affordance */}
        <div className="p-3 border-t">
          <button
            onClick={() => setActiveSc(null)}
            className="w-full text-xs py-1.5 rounded-md border hover:bg-accent/50 transition-colors"
          >
            Clear selection
          </button>
        </div>
      </aside>

      {/* ── RIGHT: live preview + findings ── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* URL row — actions live here ONLY (progress lives in the left column) */}
        <div className="px-3 py-2 border-b bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono text-muted-foreground truncate">
              {targetUrl}
            </span>
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
            {status === "complete" && (
              <>
                <button
                  onClick={() => (window.location.href = "/")}
                  className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  New audit
                </button>
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="text-xs px-2.5 py-1 rounded-md border hover:bg-accent/50 transition-colors disabled:opacity-50"
                >
                  {downloadingPdf ? "Preparing…" : "Download PDF"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar while running */}
        {status === "running" && progress && typeof progress.pagesDone === "number" && typeof progress.pagesTotal === "number" && (
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{
                width: `${Math.min(100, (progress.pagesDone / Math.max(1, progress.pagesTotal)) * 100)}%`,
              }}
            />
          </div>
        )}

        {/* Preview-blocked prompt: audit continues without preview */}
        {frameBlocked && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b bg-amber-50 dark:bg-amber-950/40 text-xs">
            <p className="text-amber-800 dark:text-amber-300 min-w-0">
              <span className="font-medium">{targetUrl}</span> blocks embedding — the
              audit runs normally without the preview{firstScreenshot ? ", showing the captured screenshot instead" : ""}.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 rounded border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
              >
                Open in new tab
              </a>
              <button
                onClick={() => setFrameBlocked(false)}
                className="px-2 py-1 rounded border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Preview: sandboxed live iframe; when the site blocks embedding
            (X-Frame-Options/CSP), show the full-page screenshot captured
            during the audit instead of a dead panel */}
        <div className="flex-1 min-h-0 bg-white flex relative">
          <iframe
            key={previewKey}
            src={targetUrl}
            title={`Live preview of ${targetUrl}`}
            sandbox="allow-scripts allow-forms allow-popups"
            className={`w-full h-full border-0 ${frameBlocked ? "hidden" : ""}`}
            onLoad={(e) => {
              try {
                const doc = (e.target as HTMLIFrameElement).contentWindow?.document;
                if (doc && !doc.body?.childElementCount) setFrameBlocked(true);
              } catch {
                setFrameBlocked(true);
              }
            }}
          />
          {frameBlocked && (
            <div className="absolute inset-0 flex flex-col bg-background">
              {firstScreenshot ? (
                <>
                  <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/20">
                    <p className="text-xs text-muted-foreground">
                      {targetUrl} blocks embedding — showing the audited screenshot
                    </p>
                    <a
                      href={targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
                    >
                      Open live site
                    </a>
                  </div>
                  <div className="flex-1 overflow-auto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={firstScreenshot}
                      alt={`Full-page screenshot of ${targetUrl} captured during audit`}
                      className="w-full"
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
                  <p className="text-sm font-medium">
                    This site doesn&apos;t allow embedding in previews
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    {targetUrl} sends X-Frame-Options / CSP headers that block
                    iframe previews. The audit itself is unaffected.
                  </p>
                  <a
                    href={targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                  >
                    Open in new tab
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

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
