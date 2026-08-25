import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { Finding } from "@/engine/finding-mapping";
import { computeComplianceMatrix, type WcagScoreEntry } from "@/engine/normalize";
import { callPlugin } from "./lib/figma-bridge";

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

export function App() {
  const [scope, setScope] = useState<"selection" | "page">("page");
  const [loading, setLoading] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [testedScIds, setTestedScIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [missingNodeIndex, setMissingNodeIndex] = useState<number | null>(null);

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFindings(null);
    try {
      const res = await callPlugin<{ findings: Finding[]; testedScIds: string[] }>("run-audit", { scope });
      setFindings(res.findings);
      setTestedScIds(res.testedScIds);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  const generateReport = useCallback(async () => {
    if (!findings) return;
    setReportBusy(true);
    setError(null);
    try {
      await callPlugin("generate-report", { findings });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReportBusy(false);
    }
  }, [findings]);

  const matrix = useMemo(
    () => (findings ? computeComplianceMatrix(findings, testedScIds) : null),
    [findings, testedScIds]
  );

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

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant={scope === "selection" ? "default" : "outline"}
          className="flex-1"
          aria-pressed={scope === "selection"}
          onClick={() => setScope("selection")}
        >
          Selection
        </Button>
        <Button
          size="sm"
          variant={scope === "page" ? "default" : "outline"}
          className="flex-1"
          aria-pressed={scope === "page"}
          onClick={() => setScope("page")}
        >
          Current page
        </Button>
      </div>

      <Button onClick={runAudit} disabled={loading} className="w-full">
        {loading ? "Auditing…" : "Run audit"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Runs entirely in this file — no login, no network calls, nothing stored.
      </p>

      {error && <p className="text-destructive">{error}</p>}

      {matrix && (
        <>
          <Card>
            <CardContent className="pt-4 space-y-1">
              <p className="font-semibold text-sm">{matrix.wcagScore}% WCAG score</p>
              <p className="text-muted-foreground">
                {matrix.automatablePassed} of {matrix.totalAutomatable} automatable criteria passing · {findings?.length ?? 0} findings
              </p>
            </CardContent>
          </Card>

          <Button onClick={generateReport} disabled={reportBusy || !findings || findings.length === 0} variant="outline" className="w-full">
            {reportBusy ? "Writing report…" : "Generate report in file"}
          </Button>

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
                      {entries.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between text-xs py-0.5">
                          <span className="truncate">
                            {entry.id} {entry.name}
                          </span>
                          <Badge variant={statusVariant(entry.status)}>{STATUS_LABEL[entry.status]}</Badge>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {findings && findings.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold">Findings</h3>
              {findings.slice(0, 40).map((f, i) => (
                <div key={i} className="border rounded px-2 py-1.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{f.rule_title}</span>
                    <Badge variant={f.severity === "critical" || f.severity === "serious" ? "destructive" : "secondary"}>
                      {f.severity}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground truncate">{f.element_html}</p>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      setMissingNodeIndex(null);
                      callPlugin<boolean>("highlight-node", { nodeId: f.selector })
                        .then((found) => {
                          if (!found) setMissingNodeIndex(i);
                        })
                        .catch(() => {});
                    }}
                  >
                    Select on canvas
                  </Button>
                  {missingNodeIndex === i && (
                    <p className="text-destructive">Element no longer on canvas.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
