"use client";

import { type ReactNode } from "react";

export type SourceFilter = "all" | "axe-core" | "keyboard" | "code-lint" | "android-lint" | "needs_review";

interface FiltersProps {
  sourceFilter: SourceFilter;
  onSourceFilterChange: (filter: SourceFilter) => void;
  children?: ReactNode;
}

export function Filters({ sourceFilter, onSourceFilterChange, children }: FiltersProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={sourceFilter}
        onChange={(e) => onSourceFilterChange(e.target.value as SourceFilter)}
        className="rounded-md border bg-background px-3 py-2 text-sm"
      >
        <option value="all">All sources</option>
        <option value="axe-core">axe-core</option>
        <option value="keyboard">Keyboard</option>
        <option value="code-lint">Code lint</option>
        <option value="android-lint">Android lint</option>
        <option value="needs_review">Needs review</option>
      </select>
      {children}
    </div>
  );
}
