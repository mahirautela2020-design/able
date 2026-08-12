"use client";

import { type FindingRow } from "@/lib/axe/types";
import { Card, CardContent } from "@/components/ui/card";

interface EvidenceViewerProps {
  finding: FindingRow;
}

export function EvidenceViewer({ finding }: EvidenceViewerProps) {
  return (
    <Card>
      <CardContent className="py-3 space-y-3">
        <h3 className="text-sm font-medium">Evidence</h3>

        {finding.full_screenshot_url && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Full Screenshot</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={finding.full_screenshot_url}
              alt={`Full page screenshot for ${finding.rule_id} finding`}
              className="w-full rounded border"
              loading="lazy"
            />
          </div>
        )}

        {finding.screenshot_crop_url && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Cropped Evidence</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={finding.screenshot_crop_url}
              alt={`Cropped evidence for ${finding.rule_id}`}
              className="w-48 h-auto rounded border"
              loading="lazy"
            />
          </div>
        )}

        {!finding.full_screenshot_url && !finding.screenshot_crop_url && (
          <p className="text-xs text-muted-foreground italic">
            No evidence screenshots available for this finding.
          </p>
        )}

        {finding.selector && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">DOM Snippet</p>
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
              {finding.element_html || finding.selector}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
