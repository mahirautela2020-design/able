"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/supabase/client";
import { Lightbox } from "@/components/ui/lightbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface WcagEntry {
  id: string;
  name: string;
  level: string;
  principle: string;
  status: string;
  findingsCount: number;
}

interface Finding {
  id: string;
  bucket: string;
  rule_id: string;
  rule_title: string;
  wcag_criterion: string | null;
  wcag_level: string | null;
  severity: string;
  confidence: number;
  selector: string;
  element_html: string | null;
  failure_summary: string;
  additional_instances: number;
  screenshot_crop_url: string | null;
  full_screenshot_url: string | null;
  evidence: Record<string, unknown>;
  recommendation: string | null;
}

interface AuditData {
  id: string;
  target_url: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  progress?: {
    pagesTotal?: number;
    pagesDone?: number;
    currentPage?: string;
  };
  report_path?: string | null;
  error_code?: string | null;
}

interface ReportData {
  audit: AuditData;
  findings: Finding[];
  reportUrl: string | null;
}

const statusColor: Record<string, string> = {
  "automated-pass": "bg-green-100 text-green-800",
  fail: "bg-red-100 text-red-800",
  "needs-review": "bg-yellow-100 text-yellow-800",
  manual: "bg-gray-100 text-gray-800",
  "not-applicable": "bg-gray-50 text-gray-400",
};

const statusIcon: Record<string, string> = {
  "automated-pass": "✅",
  fail: "❌",
  "needs-review": "👁️",
  manual: "🖐️",
  "not-applicable": "—",
};

const severityColor: Record<string, string> = {
  critical: "border-l-red-500",
  serious: "border-l-orange-500",
  moderate: "border-l-yellow-500",
  minor: "border-l-blue-500",
};

export function ReportViewer({ auditId }: { auditId: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/audits/${auditId}/report`, { headers });
        if (!res.ok) throw new Error("Report not found");
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [auditId]);

  useEffect(() => {
    if (data?.audit.status === "queued" || data?.audit.status === "running") {
      const interval = setInterval(
        () =>
          authHeaders()
            .then((headers) => fetch(`/api/audits/${auditId}/report`, { headers }))
            .then((r) => r.json())
            .then((json) => {
              setData(json);
              if (json.audit.status === "complete" || json.audit.status === "failed") {
                clearInterval(interval);
              }
            })
            .catch(() => {}),
        4000
      );
      return () => clearInterval(interval);
    }
  }, [data?.audit.status, auditId]);
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading report...
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {error || "Report not found"}
        </CardContent>
      </Card>
    );
  }

  const { audit, findings, reportUrl } = data;

  if (audit.status === "queued" || audit.status === "running") {
    const progress = audit.progress;
    const pct = progress && progress.pagesTotal
      ? Math.round((progress.pagesDone! / progress.pagesTotal) * 100)
      : 50;

    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-lg font-medium mb-4">Audit in progress...</p>
          <Progress value={pct} className="max-w-xs mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {progress?.pagesDone || 0}/{progress?.pagesTotal || "?"} pages scanned
            {progress?.currentPage ? ` — ${progress.currentPage}` : ""}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (audit.status === "failed") {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-lg font-medium text-destructive">Audit failed</p>
          <p className="text-sm text-muted-foreground mt-2">
            {audit.error_code || "Unknown error"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const automated = findings.filter((f) => f.bucket === "automated");
  const needsReview = findings.filter((f) => f.bucket === "needs_review");
  const behavior = findings.filter((f) => f.bucket === "behavior");
  const bestPractice = findings.filter((f) => f.bucket === "best-practice");

  const severityCounts = {
    critical: automated.filter((f) => f.severity === "critical").length,
    serious: automated.filter((f) => f.severity === "serious").length,
    moderate: automated.filter((f) => f.severity === "moderate").length,
    minor: automated.filter((f) => f.severity === "minor").length,
  };

  const matrix: WcagEntry[] = computeMatrix(findings);

  const pourGroups: Record<string, WcagEntry[]> = {};
  for (const sc of matrix) {
    if (!pourGroups[sc.principle]) pourGroups[sc.principle] = [];
    pourGroups[sc.principle].push(sc);
  }

  return (
    <div className="space-y-6">
      {reportUrl && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              // PDF is generated server-side (16:9 landscape) — download it
              window.location.href = `/api/audits/${auditId}/pdf`;
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Download PDF (16:9)
          </Button>
          <Button variant="outline" onClick={() => window.open(reportUrl!, "_blank")}>
            <Download className="h-4 w-4 mr-2" />
            View HTML Report
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Executive Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">
            {computeWcagScore(findings)}%
          </p>
          <div className="flex flex-wrap gap-3 mt-3">
            {severityCounts.critical > 0 && (
              <Badge variant="destructive">{severityCounts.critical} critical</Badge>
            )}
            {severityCounts.serious > 0 && (
              <Badge className="bg-orange-500">{severityCounts.serious} serious</Badge>
            )}
            {severityCounts.moderate > 0 && (
              <Badge className="bg-yellow-500">{severityCounts.moderate} moderate</Badge>
            )}
            {severityCounts.minor > 0 && (
              <Badge className="bg-blue-500">{severityCounts.minor} minor</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            {needsReview.length} needs review · {behavior.length} keyboard ·{" "}
            {bestPractice.length} best-practice · {automated.length} automated findings
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WCAG 2.2 Compliance Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion>{(Object.entries(pourGroups) as [string, WcagEntry[]][]).map(
              ([principle, scs]) => (
                <AccordionItem key={principle} value={principle}>
                  <AccordionTrigger>
                    {principle} ({scs.length} criteria)
                  </AccordionTrigger>
                  <AccordionContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px]">SC</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="w-[60px]">Level</TableHead>
                          <TableHead className="w-[120px]">Status</TableHead>
                          <TableHead className="w-[60px]">#</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scs.map((sc) => (
                          <TableRow key={sc.id}>
                            <TableCell className="font-mono text-sm">
                              {sc.id}
                            </TableCell>
                            <TableCell className="text-sm">{sc.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{sc.level}</Badge>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor[sc.status] || ""}`}
                              >
                                {statusIcon[sc.status]} {sc.status}
                              </span>
                            </TableCell>
                            <TableCell>{sc.findingsCount || ""}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </AccordionContent>
                </AccordionItem>
              )
            )}
          </Accordion>
        </CardContent>
      </Card>

      <Tabs defaultValue="automated">
        <TabsList>
          <TabsTrigger value="automated">
            Automated ({automated.length})
          </TabsTrigger>
          <TabsTrigger value="needs-review">
            Needs Review ({needsReview.length})
          </TabsTrigger>
          <TabsTrigger value="keyboard">
            Keyboard ({behavior.length})
          </TabsTrigger>
          <TabsTrigger value="best-practice">
            Best Practice ({bestPractice.length})
          </TabsTrigger>
        </TabsList>

        {(["automated", "needs-review", "keyboard", "best-practice"] as const).map(
          (tab) => {
            const items =
              tab === "automated"
                ? automated
                : tab === "needs-review"
                  ? needsReview
                  : tab === "keyboard"
                    ? behavior
                    : bestPractice;

            return (
              <TabsContent key={tab} value={tab}>
                {items.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      No findings in this category.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {items.map((f) => (
                      <Card
                        key={f.id}
                        className={`border-l-4 ${severityColor[f.severity] || ""}`}
                      >
                        <CardContent className="py-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge
                                  variant={
                                    f.severity === "critical"
                                      ? "destructive"
                                      : "outline"
                                  }
                                >
                                  {f.severity}
                                </Badge>
                                <span className="font-mono text-xs text-muted-foreground">
                                  {f.wcag_criterion || "best-practice"}
                                </span>
                                <span className="font-medium text-sm truncate">
                                  {f.rule_title}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {f.failure_summary}
                              </p>
                              {f.selector && (
                                <code className="text-xs bg-muted px-1 py-0.5 rounded mt-1 inline-block">
                                  {f.selector}
                                </code>
                              )}
                              {f.additional_instances > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  + {f.additional_instances} more instance
                                  {f.additional_instances > 1 ? "s" : ""}
                                </p>
                              )}
                            </div>
                            {f.screenshot_crop_url && (
                              <button
                                type="button"
                                onClick={() => setLightbox(f.screenshot_crop_url!)}
                                className="shrink-0"
                                aria-label={`Open evidence screenshot for ${f.rule_id} in full size`}
                              >
                                <img
                                  src={f.screenshot_crop_url}
                                  alt={`Evidence for ${f.rule_id}`}
                                  className="w-24 h-16 object-cover rounded border shrink-0 cursor-zoom-in hover:ring-2 hover:ring-ring transition-shadow"
                                />
                              </button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            );
          }
        )}
      </Tabs>
      {lightbox && (
        <Lightbox
          src={lightbox}
          alt="Evidence screenshot"
          caption="Evidence screenshot — click outside or press Esc to close"
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function computeMatrix(findings: Finding[]): WcagEntry[] {
  const map = new Map<string, WcagEntry>();

  for (const f of findings) {
    const criteria = f.wcag_criterion ? [f.wcag_criterion] : [];
    for (const sc of criteria) {
      if (!map.has(sc)) {
        map.set(sc, {
          id: sc,
          name: "",
          level: f.wcag_level || "",
          principle: "",
          status: f.bucket === "needs_review" ? "needs-review" : "fail",
          findingsCount: 0,
        });
      }
      const entry = map.get(sc)!;
      if (f.bucket === "automated") entry.status = "fail";
      else if (f.bucket === "needs_review" && entry.status !== "fail")
        entry.status = "needs-review";
      entry.findingsCount++;
    }
  }

  return Array.from(map.values());
}

function computeWcagScore(findings: Finding[]): number {
  const weights: Record<string, number> = {
    critical: 10,
    serious: 5,
    moderate: 2,
    minor: 0.5,
  };
  const automated = findings.filter((f) => f.bucket === "automated");
  const failedScs = new Set(automated.map((f) => f.wcag_criterion).filter(Boolean));
  let penalty = 0;
  for (const sc of failedScs) {
    const scFindings = automated.filter((f) => f.wcag_criterion === sc);
    penalty += Math.max(...scFindings.map((f) => weights[f.severity] || 0));
  }
  const score = Math.max(0, 100 - penalty);
  return Math.round(score * 10) / 10;
}
