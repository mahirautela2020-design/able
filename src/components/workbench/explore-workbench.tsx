"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FindingRow } from "@/lib/axe/types";
import { FindingsListClient } from "./findings-list";
import { ExplorePanel } from "./explore/explore-panel";

export type WorkbenchMode = "view" | "explore";

interface ViewExploreToggleProps {
  mode: WorkbenchMode;
  onChange: (mode: WorkbenchMode) => void;
}

export function ViewExploreToggle({ mode, onChange }: ViewExploreToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Workbench mode"
      data-testid="view-explore-toggle"
      className="inline-flex items-center rounded-lg bg-muted p-1"
    >
      <ToggleButton
        label="View"
        selected={mode === "view"}
        onClick={() => onChange("view")}
      />
      <ToggleButton
        label="Explore"
        selected={mode === "explore"}
        onClick={() => onChange("explore")}
      />
    </div>
  );
}

function ToggleButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
        selected
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

interface ExploreWorkbenchProps {
  targetUrl: string;
  auditId: string | null;
  findings: FindingRow[];
  scopePages: { id: string; page_title: string | null }[];
  auditUrl: string;
  auditCreatedAt: string;
}

export function ExploreWorkbench({
  targetUrl,
  auditId,
  findings,
  scopePages,
  auditUrl,
  auditCreatedAt,
}: ExploreWorkbenchProps) {
  const [mode, setMode] = useState<WorkbenchMode>("view");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-2 border-b">
        <ViewExploreToggle mode={mode} onChange={setMode} />
        <span className="text-xs text-muted-foreground">
          {mode === "view"
            ? "Findings list"
            : "Interactive explore (same-origin demo)"}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        {mode === "view" ? (
          <FindingsListClient
            findings={findings}
            scopePages={scopePages}
            auditUrl={auditUrl}
            auditCreatedAt={auditCreatedAt}
          />
        ) : (
          <ExplorePanel targetUrl={targetUrl} auditId={auditId} />
        )}
      </div>
    </div>
  );
}
