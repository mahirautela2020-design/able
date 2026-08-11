"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type FindingRow } from "@/lib/axe/types";

export type SeverityFilter = "all" | "critical" | "serious" | "moderate" | "minor";
export type LevelFilter = "all" | "A" | "AA" | "AAA";

export interface FilterState {
  severity: SeverityFilter;
  level: LevelFilter;
  pageId: string;
  status: "all" | "automated" | "needs_review";
}

const severityFilters: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "serious", label: "Serious" },
  { value: "moderate", label: "Moderate" },
  { value: "minor", label: "Minor" },
];

const levelFilters: { value: LevelFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "A", label: "A" },
  { value: "AA", label: "AA" },
  { value: "AAA", label: "AAA" },
];

const bucketFilters: { value: "all" | "automated" | "needs_review"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "automated", label: "Automated" },
  { value: "needs_review", label: "Needs Review" },
];

export function applyFilters(findings: FindingRow[], filters: FilterState): FindingRow[] {
  return findings.filter((f) => {
    if (filters.severity !== "all" && f.severity !== filters.severity) return false;
    if (filters.level !== "all" && f.wcag_level !== filters.level) return false;
    if (filters.pageId !== "all" && f.page_id !== filters.pageId) return false;
    if (filters.status !== "all" && f.bucket !== filters.status) return false;
    return true;
  });
}

interface FiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  pageIds: string[];
  className?: string;
}

export function Filters({ filters, onChange, pageIds, className }: FiltersProps) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium">Severity:</span>
        <div className="flex gap-0.5">
          {severityFilters.map((sf) => (
            <Button
              key={sf.value}
              variant={filters.severity === sf.value ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChange({ ...filters, severity: sf.value })}
            >
              {sf.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium">Level:</span>
        <div className="flex gap-0.5">
          {levelFilters.map((lf) => (
            <Button
              key={lf.value}
              variant={filters.level === lf.value ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChange({ ...filters, level: lf.value })}
            >
              {lf.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium">Status:</span>
        <div className="flex gap-0.5">
          {bucketFilters.map((bf) => (
            <Button
              key={bf.value}
              variant={filters.status === bf.value ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChange({ ...filters, status: bf.value })}
            >
              {bf.label}
            </Button>
          ))}
        </div>
      </div>

      {pageIds.length > 1 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium">Page:</span>
          <select
            className="h-7 px-2 text-xs rounded-md border bg-background"
            value={filters.pageId}
            onChange={(e) => onChange({ ...filters, pageId: e.target.value })}
          >
            <option value="all">All pages</option>
            {pageIds.map((pid) => (
              <option key={pid} value={pid}>
                {pid}
              </option>
            ))}
          </select>
        </div>
      )}

      {findingsFilteredCount(filters) > 0 && (
        <Badge variant="secondary" className="h-7">
          {findingsFilteredCount(filters)} active filter{filters.severity !== "all" || filters.level !== "all" || filters.pageId !== "all" || filters.status !== "all" ? "s" : ""}
        </Badge>
      )}
    </div>
  );
}

function findingsFilteredCount(filters: FilterState): number {
  return [
    filters.severity !== "all",
    filters.level !== "all",
    filters.pageId !== "all",
    filters.status !== "all",
  ].filter(Boolean).length;
}
