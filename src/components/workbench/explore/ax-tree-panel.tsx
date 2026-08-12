"use client";

import { AxTree } from "@/components/workbench/ax-tree";
import type { AxSnapshot } from "@/lib/axe/types";

interface AxTreePanelProps {
  snapshot: AxSnapshot | null;
  loading: boolean;
  error: string | null;
  onSelectNode: (role: string, name: string) => void;
}

export function AxTreePanel({
  snapshot,
  loading,
  error,
  onSelectNode,
}: AxTreePanelProps) {
  if (loading) {
    return (
      <div data-testid="ax-tree-loading" className="p-4 text-sm text-muted-foreground">
        Capturing accessibility tree…
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="ax-tree-error" className="p-4 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div data-testid="ax-tree-empty" className="p-4 text-sm text-muted-foreground">
        No accessibility tree available.
      </div>
    );
  }

  return (
    <div data-testid="ax-tree-panel" className="p-4">
      <p className="text-xs text-muted-foreground mb-2">
        Click a node to highlight it in the preview.
      </p>
      <AxTree root={snapshot} onNodeClick={onSelectNode} />
    </div>
  );
}
