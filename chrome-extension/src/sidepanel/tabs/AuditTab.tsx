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
import { runAxeOnTab, callTab } from "../lib/tab-bridge";

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
            <CardContent className="pt-4 text-xs space-y-1">
              <p className="font-semibold text-sm">{matrix.wcagScore}% WCAG score</p>
              <p className="text-muted-foreground">
                {matrix.automatablePassed} of {matrix.totalAutomatable} automatable criteria passing · {findings?.length ?? 0} findings
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
