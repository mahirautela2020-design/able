import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { extractFindings, type AxeResult, type Finding } from "@/engine/finding-mapping";
import { computeComplianceMatrix, type WcagScoreEntry } from "@/engine/normalize";
import { runAxeOnTab, callTab, captureVisibleTabWithRetry } from "../lib/tab-bridge";

const PRINCIPLES = ["Perceivable", "Operable", "Understandable", "Robust"] as const;

const STATUS_LABEL: Record<WcagScoreEntry["status"], string> = {
  "automated-pass": "Pass",
  fail: "Fail",
  needs_review: "Review",
  manual: "Manual",
  "not-applicable": "N/A",
};

function statusVariant(status: WcagScoreEntry["status"]): "default" | "destructive" | "outline" | "secondary" {
  if (status === "fail") return "destructive";
  if (status === "automated-pass") return "default";
  if (status === "needs_review") return "secondary";
  return "outline";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Crops a full-viewport screenshot down to the element's own box (plus a
 * little padding) -- the same "tight shot of the violated element" style
 * Lighthouse/axe DevTools use, instead of handing the reader a whole page
 * screenshot and making them hunt for what's wrong. `rect` is in CSS px
 * (from content-script.ts's highlight()); captureVisibleTab's PNG is in
 * device px, so it's scaled by `dpr` before cropping. */
function cropToElement(
  dataUrl: string,
  rect: { x: number; y: number; width: number; height: number },
  dpr: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const pad = 24 * dpr;
      const sx = Math.max(0, Math.round(rect.x * dpr - pad));
      const sy = Math.max(0, Math.round(rect.y * dpr - pad));
      const sw = Math.min(img.naturalWidth - sx, Math.round(rect.width * dpr + pad * 2));
      const sh = Math.min(img.naturalHeight - sy, Math.round(rect.height * dpr + pad * 2));
      if (sw <= 0 || sh <= 0) {
        resolve(dataUrl); // off-screen or zero-size -- fall back to the full shot
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Builds a print-ready HTML document: one 16:9 (1280x720 CSS px) page per
 * finding with its evidence screenshot, plus a cover page with the score
 * summary -- the same shape as the website's PDF export, generated
 * entirely client-side via the browser's native print-to-PDF instead of a
 * server route. Extension audits never touch Supabase/Playwright (no
 * login, nothing stored), so there's no audit id to hand the website's
 * server-side /api/audits/[id]/pdf route -- this reconstructs the same
 * "evidence per violation, 16:9" idea without one. */
function buildPrintHtml(
  url: string,
  wcagScore: number,
  automatablePassed: number,
  totalAutomatable: number,
  shots: { finding: Finding; dataUrl: string | null }[]
): string {
  const pageCss = `
    @page { size: 1280px 720px; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; color: #1a1a1a; }
    .page { width: 1280px; height: 720px; padding: 48px; page-break-after: always; display: flex; flex-direction: column; }
    .page:last-child { page-break-after: auto; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 20px; margin: 0 0 12px; }
    .muted { color: #666; }
    .score { font-size: 56px; font-weight: 700; margin: 24px 0; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .badge.critical, .badge.serious { background: #fee2e2; color: #991b1b; }
    .badge.moderate { background: #fef3c7; color: #92400e; }
    .badge.minor { background: #e5e7eb; color: #374151; }
    .selector { font-family: monospace; font-size: 13px; color: #555; margin: 4px 0 12px; }
    .body-row { flex: 1; display: flex; gap: 24px; min-height: 0; }
    .shot-wrap { flex: 1.2; display: flex; align-items: center; justify-content: center; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; background: #fafafa; min-width: 0; }
    img.shot { max-width: 100%; max-height: 100%; object-fit: contain; }
    .no-shot { color: #999; font-size: 14px; padding: 0 24px; text-align: center; }
    .fix { flex: 1; min-width: 0; overflow: hidden; }
    .fix h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; margin: 0 0 6px; }
    .fix p { font-size: 14px; line-height: 1.5; margin: 0 0 12px; }
    .fix a { color: #2563eb; font-size: 13px; }
    footer { margin-top: 12px; font-size: 11px; color: #999; }
  `;

  const cover = `
    <div class="page">
      <h1>ScanA11y accessibility report</h1>
      <p class="muted">${escapeHtml(url)}</p>
      <div class="score">${wcagScore}% WCAG score</div>
      <p class="muted">${automatablePassed} of ${totalAutomatable} automatable criteria passing · ${shots.length} findings with evidence</p>
      <footer>Generated client-side by the ScanA11y Chrome extension — axe-core + a live keyboard walkthrough, run directly in this tab. No account, nothing stored.</footer>
    </div>
  `;

  const pages = shots
    .map(({ finding, dataUrl }) => {
      const helpUrl = typeof finding.evidence.helpUrl === "string" ? finding.evidence.helpUrl : null;
      return `
      <div class="page">
        <h2>${escapeHtml(finding.rule_title)}</h2>
        <p>
          <span class="badge ${finding.severity}">${escapeHtml(finding.severity)}</span>
          &nbsp; WCAG ${finding.wcag_criteria.join(", ")} (${finding.wcag_level})
        </p>
        <p class="selector">${escapeHtml(finding.selector)}</p>
        <div class="body-row">
          <div class="shot-wrap">
            ${dataUrl ? `<img class="shot" src="${dataUrl}" />` : `<span class="no-shot">Screenshot unavailable for this element</span>`}
          </div>
          <div class="fix">
            <h3>How to fix</h3>
            <p>${escapeHtml(finding.failure_summary || "No remediation detail provided by the rule.")}</p>
            ${helpUrl ? `<a href="${escapeHtml(helpUrl)}">Learn more →</a>` : ""}
          </div>
        </div>
      </div>
    `;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ScanA11y report</title><style>${pageCss}</style></head><body>${cover}${pages}</body></html>`;
}

/**
 * Real WCAG compliance-matrix presentation (same extractFindings +
 * computeComplianceMatrix + wcag-registry the web app's workbench uses),
 * not a flat axe-violations list. axe-core runs directly in the tab
 * (no Playwright -- see finding-mapping.ts's module doc); a native
 * keyboard/focus-order check (content-script.ts's keyboardWalkthrough,
 * replicating what src/engine/keyboard.ts checks server-side via
 * Playwright) contributes a WCAG 2.4.7 finding when a live tab-order walk
 * finds an element with no visible focus indicator.
 */
export function AuditTab() {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFindings(null);
    try {
      const axeRes = await runAxeOnTab();
      if (!axeRes.ok) throw new Error(axeRes.error || "axe-core failed to run");

      const mapped = extractFindings(axeRes.result as AxeResult, "extension", new Map());

      const kb = await callTab<{ focusableCount: number; missingIndicatorCount: number; unreachableCount: number }>(
        "keyboard-walkthrough"
      ).catch(() => null);

      const behaviorFindings: Finding[] = [];
      if (kb && kb.missingIndicatorCount > 0) {
        behaviorFindings.push({
          bucket: "behavior",
          rule_id: "focus-visible-indicator",
          rule_title: "Elements receive focus with no visible indicator",
          wcag_criteria: ["2.4.7"],
          wcag_criterion: "2.4.7",
          wcag_level: "AA",
          principle: "Operable",
          severity: "serious",
          confidence: 0.9,
          source_engines: ["native-keyboard-walkthrough"],
          selector: "",
          element_html: "",
          failure_summary: `${kb.missingIndicatorCount} of ${kb.focusableCount} focusable elements have no visible focus outline or box-shadow when focused.`,
          additional_instances: Math.max(0, kb.missingIndicatorCount - 1),
          bbox: null,
          evidence: { focusableCount: kb.focusableCount },
          engine_version: null,
        });
      }

      setFindings([...mapped, ...behaviorFindings]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const matrix = useMemo(() => (findings ? computeComplianceMatrix(findings) : null), [findings]);

  const byPrinciple = useMemo(() => {
    if (!matrix) return null;
    const map = new Map<string, WcagScoreEntry[]>();
    for (const p of PRINCIPLES) map.set(p, []);
    for (const entry of matrix.sc) {
      if (!map.has(entry.principle)) map.set(entry.principle, []);
      map.get(entry.principle)!.push(entry);
    }
    return map;
  }, [matrix]);

  // Maps an SC id ("2.4.7") to the findings that failed it, so the
  // accordion row itself can highlight on the page -- previously the only
  // way to locate a failure was scrolling down to the separate flat
  // findings list below.
  const findingsBySc = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const f of findings ?? []) {
      for (const sc of f.wcag_criteria) {
        if (!map.has(sc)) map.set(sc, []);
        map.get(sc)!.push(f);
      }
    }
    return map;
  }, [findings]);

  const highlightSc = useCallback(
    (scId: string) => {
      const scFindings = findingsBySc.get(scId) ?? [];
      const target = scFindings.find((f) => f.selector);
      if (target) callTab("highlight", { selector: target.selector }).catch(() => {});
    },
    [findingsBySc]
  );

  const downloadPdf = useCallback(async () => {
    if (!findings || !matrix) return;
    setPdfBusy(true);
    setError(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url ?? "";

      const withSelector = findings.filter((f) => f.selector).slice(0, 20);
      const shots: { finding: Finding; dataUrl: string | null }[] = [];
      for (const finding of withSelector) {
        const hl = await callTab<{ ok: boolean; rect: { x: number; y: number; width: number; height: number } | null; devicePixelRatio: number }>(
          "highlight",
          { selector: finding.selector }
        ).catch(() => null);
        await new Promise((r) => setTimeout(r, 250)); // let scroll/paint settle
        // >=550ms between captureVisibleTab calls to stay under Chrome's
        // ~2/sec quota -- the earlier 220ms-only version silently hit that
        // quota on nearly every call, which is why screenshots kept coming
        // back empty.
        const raw = await captureVisibleTabWithRetry();
        const dataUrl = raw && hl?.rect ? await cropToElement(raw, hl.rect, hl.devicePixelRatio || 1) : raw;
        shots.push({ finding, dataUrl });
        await new Promise((r) => setTimeout(r, 300));
      }
      await callTab("clear-highlight").catch(() => {});

      const html = buildPrintHtml(url, matrix.wcagScore, matrix.automatablePassed, matrix.totalAutomatable, shots);
      const win = window.open("", "_blank", "width=1280,height=800");
      if (!win) {
        setError("Pop-up blocked — allow pop-ups for this extension to download the PDF.");
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      // Let images decode before invoking the browser's print-to-PDF dialog.
      setTimeout(() => win.print(), 400);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPdfBusy(false);
    }
  }, [findings, matrix]);

  return (
    <div className="space-y-3">
      <Button onClick={runAudit} disabled={loading} className="w-full">
        {loading ? "Scanning…" : "Run audit on this page"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        axe-core + a live keyboard/focus-order walkthrough, run directly in this tab. Nothing sent to a server, nothing saved.
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {matrix && (
        <>
          <Card>
            <CardContent className="pt-4 text-xs space-y-2">
              <p className="font-semibold text-sm">{matrix.wcagScore}% WCAG score</p>
              <p className="text-muted-foreground">
                {matrix.automatablePassed} of {matrix.totalAutomatable} automatable criteria passing · {findings?.length ?? 0} findings
              </p>
              <Button size="sm" variant="outline" className="w-full" onClick={downloadPdf} disabled={pdfBusy}>
                {pdfBusy ? "Capturing evidence…" : "Download PDF report (16:9)"}
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Opens the browser&apos;s print dialog with the report — choose &quot;Save as PDF&quot; as the destination.
              </p>
            </CardContent>
          </Card>

          <Accordion defaultValue={PRINCIPLES as unknown as string[]}>
            {PRINCIPLES.map((principle) => {
              const entries = byPrinciple?.get(principle) ?? [];
              const failCount = entries.filter((e) => e.status === "fail").length;
              return (
                <AccordionItem key={principle} value={principle}>
                  <AccordionTrigger className="text-xs">
                    {principle}
                    {failCount > 0 && (
                      <Badge variant="destructive" className="ml-2">
                        {failCount}
                      </Badge>
                    )}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1">
                      {entries.map((entry) => {
                        const hasTarget = (findingsBySc.get(entry.id) ?? []).some((f) => f.selector);
                        return (
                          <div key={entry.id} className="flex items-center justify-between gap-2 text-xs py-0.5">
                            <span className="truncate">
                              {entry.id} {entry.name}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant={statusVariant(entry.status)}>{STATUS_LABEL[entry.status]}</Badge>
                              {entry.status === "fail" && hasTarget && (
                                <Button size="xs" variant="outline" onClick={() => highlightSc(entry.id)}>
                                  Show
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {findings && findings.filter((f) => f.selector).length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold">Findings</h3>
              {findings
                .filter((f) => f.selector)
                .slice(0, 30)
                .map((f, i) => (
                  <div key={i} className="border rounded px-2 py-1.5 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{f.rule_title}</span>
                      <Badge variant={f.severity === "critical" || f.severity === "serious" ? "destructive" : "secondary"}>
                        {f.severity}
                      </Badge>
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground truncate">{f.selector}</p>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => callTab("highlight", { selector: f.selector }).catch(() => {})}
                    >
                      Highlight on page
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
