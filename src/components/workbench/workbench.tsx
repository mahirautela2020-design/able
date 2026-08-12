"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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
  const [previewKey, setPreviewKey] = useState(0); // reload iframe

  const bySc = useMemo(() => {
    const map = new Map<string, WorkbenchFinding[]>();
    for (const f of findings) {
      const sc = f.wcag_criterion || "best-practice";
      const arr = map.get(sc) || [];
      arr.push(f);
      map.set(sc, arr);
    }
    return map;
  }, [findings]);

  const scList = useMemo(() => {
    const seen = new Map<string, { sc: string; count: number; worst: string }>();
    for (const [sc, fs] of bySc) {
      const worst =
        fs.find((f) => f.severity === "critical")?.severity ||
        fs.find((f) => f.severity === "serious")?.severity ||
        fs.find((f) => f.severity === "moderate")?.severity ||
        "minor";
      seen.set(sc, { sc, count: fs.length, worst });
    }
    return Array.from(seen.values()).sort((a, b) => a.sc.localeCompare(b.sc));
  }, [bySc]);

  const principleScs = scList.filter((s) => {
    const num = s.sc.split(".")[0];
    return num === activePrinciple;
  });

  const activeFindings = activeSc ? bySc.get(activeSc) || [] : [];

  return (
    <div className="flex h-full border rounded-lg overflow-hidden bg-background">
      {/* ── LEFT: WCAG checklist ── */}
      <aside className="w-[320px] shrink-0 border-r flex flex-col bg-muted/20">
        <div className="p-3 border-b">
          <h2 className="text-sm font-semibold">Accessibility Checklist</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {findings.length} findings · {bySc.size} criteria affected
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

        {/* SC list for the active principle */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {principleScs.length === 0 && (
            <p className="text-xs text-muted-foreground p-3">
              No findings under this principle.
            </p>
          )}
          {principleScs.map(({ sc, count, worst }) => (
            <button
              key={sc}
              onClick={() => setActiveSc(activeSc === sc ? null : sc)}
              className={`w-full text-left p-2 rounded-md border transition-colors ${
                activeSc === sc
                  ? "bg-accent border-primary/40"
                  : "hover:bg-accent/50 border-transparent"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-medium">{sc}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[worst] || "bg-gray-400"}`} />
                  <span className="text-xs text-muted-foreground">{count}</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {worst === "critical" || worst === "serious" ? "Fails" : "Needs review"}
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
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant={auditStatus === "complete" ? "outline" : "default"}>
              {auditStatus}
            </Badge>
            <span className="text-xs font-mono text-muted-foreground truncate">
              {targetUrl}
            </span>
          </div>
          <button
            onClick={() => setPreviewKey((k) => k + 1)}
            className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
          >
            Reload preview
          </button>
        </div>

        {/* Sandboxed live preview */}
        <div className="flex-1 min-h-0 bg-white">
          <iframe
            key={previewKey}
            src={targetUrl}
            title={`Live preview of ${targetUrl}`}
            sandbox="allow-scripts allow-forms allow-popups"
            className="w-full h-full border-0"
          />
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
