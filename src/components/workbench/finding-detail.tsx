"use client";

import { type FindingRow } from "@/lib/axe/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CriterionChip } from "@/components/workbench/criterion-chip";
import { EvidenceViewer } from "@/components/workbench/evidence-viewer";
import { X } from "lucide-react";

interface FindingDetailProps {
  finding: FindingRow | null;
  onClose: () => void;
}

const severityColor: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  serious: "bg-orange-100 text-orange-800 border-orange-300",
  moderate: "bg-yellow-100 text-yellow-800 border-yellow-300",
  minor: "bg-blue-100 text-blue-800 border-blue-300",
};

export function FindingDetail({ finding, onClose }: FindingDetailProps) {
  if (!finding) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] max-w-[90vw] bg-background border-l shadow-xl z-50 overflow-y-auto">
      <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Finding Detail</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge
              className={severityColor[finding.severity] || ""}
              variant="outline"
            >
              {finding.severity}
            </Badge>
            {finding.wcag_criterion && (
              <CriterionChip criterionId={finding.wcag_criterion} />
            )}
            {finding.wcag_level && (
              <Badge variant="secondary">{finding.wcag_level}</Badge>
            )}
          </div>
          <p className="text-sm font-medium">{finding.rule_title}</p>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            Rule: {finding.rule_id}
          </p>
        </div>

        <Card>
          <CardContent className="py-3">
            <h3 className="text-sm font-medium mb-1">Failure Summary</h3>
            <p className="text-sm text-muted-foreground">
              {finding.failure_summary}
            </p>
          </CardContent>
        </Card>

        {finding.element_html && (
          <Card>
            <CardContent className="py-3">
              <h3 className="text-sm font-medium mb-1">Element HTML</h3>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
                {finding.element_html}
              </pre>
            </CardContent>
          </Card>
        )}

        {finding.selector && (
          <Card>
            <CardContent className="py-3">
              <h3 className="text-sm font-medium mb-1">CSS Selector</h3>
              <code className="text-xs bg-muted p-1 rounded block">
                {finding.selector}
              </code>
            </CardContent>
          </Card>
        )}

        {finding.recommendation && (
          <Card>
            <CardContent className="py-3">
              <h3 className="text-sm font-medium mb-1">Fix Suggestion</h3>
              <p className="text-sm text-muted-foreground">
                {finding.recommendation}
              </p>
            </CardContent>
          </Card>
        )}

        <EvidenceViewer finding={finding} />

        <Card>
          <CardContent className="py-3">
            <h3 className="text-sm font-medium mb-1">Technical Details</h3>
            <dl className="text-xs space-y-1">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Confidence:</dt>
                <dd>{Math.round(finding.confidence * 100)}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Engine:</dt>
                <dd>{finding.source_engines.join(", ")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Version:</dt>
                <dd>{finding.engine_version || "n/a"}</dd>
              </div>
              {finding.additional_instances > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Additional instances:</dt>
                  <dd>{finding.additional_instances}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
