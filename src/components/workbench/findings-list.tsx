"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CriterionChip } from "@/components/workbench/criterion-chip";
import { Filters, applyFilters, type FilterState } from "@/components/workbench/filters";
import { FindingDetail } from "@/components/workbench/finding-detail";
import type { FindingRow } from "@/lib/axe/types";
import { ChevronRight } from "lucide-react";

interface FindingsListPageProps {
  findings: FindingRow[];
  scopePages: { id: string; page_title: string | null }[];
  auditUrl: string;
  auditCreatedAt: string;
}

const severityColor: Record<string, string> = {
  critical: "border-l-red-500",
  serious: "border-l-orange-500",
  moderate: "border-l-yellow-500",
  minor: "border-l-blue-500",
};

export function FindingsListClient({
  findings,
  scopePages,
  auditUrl,
  auditCreatedAt,
}: FindingsListPageProps) {
  const [filters, setFilters] = useState<FilterState>({
    severity: "all",
    level: "all",
    pageId: "all",
    status: "all",
  });

  const [selectedFinding, setSelectedFinding] = useState<FindingRow | null>(null);

  const pageIds = useMemo(
    () => scopePages.map((p) => p.id),
    [scopePages]
  );

  const filteredFindings = useMemo(
    () => applyFilters(findings, filters),
    [findings, filters]
  );

  const groupedFindings = useMemo(() => {
    const groups = new Map<string, FindingRow[]>();
    for (const f of filteredFindings) {
      const key = f.wcag_criterion || "other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    return groups;
  }, [filteredFindings]);

  if (findings.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-lg font-medium">No findings</p>
            <p className="text-sm mt-2">
              No accessibility issues were found for this audit.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Findings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {auditUrl} · {new Date(auditCreatedAt).toLocaleDateString()}
        </p>
      </div>

      <Filters
        filters={filters}
        onChange={setFilters}
        pageIds={pageIds}
        className="mb-6"
      />

      {filteredFindings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No findings match the current filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(groupedFindings.entries()).map(([criterion, items]) => (
            <Card key={criterion}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {criterion !== "other" ? (
                    <CriterionChip criterionId={criterion} />
                  ) : (
                    <Badge variant="outline">Other</Badge>
                  )}
                  <span className="text-muted-foreground font-normal">
                    {items.length} finding{items.length !== 1 ? "s" : ""}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {items.map((f) => (
                  <Button
                    key={f.id}
                    variant="ghost"
                    className={`w-full justify-start text-left p-3 h-auto border rounded-md ${severityColor[f.severity] || ""} border-l-4`}
                    onClick={() => setSelectedFinding(f)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge
                          variant={f.severity === "critical" ? "destructive" : "outline"}
                          className="text-xs"
                        >
                          {f.severity}
                        </Badge>
                        <span className="text-sm font-medium truncate">
                          {f.rule_title}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {f.failure_summary}
                      </p>
                      {f.selector && (
                        <code className="text-xs text-muted-foreground bg-muted px-1 py-0.5 rounded mt-1 inline-block">
                          {f.selector}
                        </code>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground ml-2" />
                  </Button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedFinding && (
        <FindingDetail
          finding={selectedFinding}
          onClose={() => setSelectedFinding(null)}
        />
      )}

      {selectedFinding && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setSelectedFinding(null)}
        />
      )}
    </div>
  );
}
