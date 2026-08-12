"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { CriterionChip } from "@/components/workbench/criterion-chip";
import { contrastRatio, contrastVerdict, suggestFix } from "@/lib/contrast";
import type { InspectedElement } from "@/lib/explore/types";

interface ContrastFixProps {
  element: InspectedElement | null;
  onApply: (selector: string, color: string) => void;
}

export function ContrastFix({ element, onApply }: ContrastFixProps) {
  const fg = element?.computed.color ?? null;
  const bg = element?.computed.backgroundColor ?? null;

  const ratio = useMemo(
    () => (fg && bg ? contrastRatio(fg, bg) : null),
    [fg, bg]
  );

  if (!ratio || !element) {
    return (
      <div data-testid="contrast-fix-empty" className="p-4 text-sm text-muted-foreground">
        Pick an element to measure live contrast.
      </div>
    );
  }

  const verdict = contrastVerdict(ratio);
  const fix = verdict.passesAA ? null : suggestFix(fg!, bg!);

  return (
    <div data-testid="contrast-fix" className="p-4 space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <CriterionChip criterionId="1.4.3" />
        <CriterionChip criterionId="1.4.11" />
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Foreground / background</p>
        <p className="font-mono">
          {fg} on {bg}
        </p>
      </div>

      <div
        data-testid="contrast-verdict"
        className={`font-semibold ${
          verdict.passesAA ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        }`}
      >
        {ratio.toFixed(2)}:1 —{" "}
        {verdict.passesAA
          ? `passes ${verdict.level}`
          : `fails AA (needs ${verdict.requiredAA.toFixed(1)}:1)`}
      </div>

      {fix && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Suggested fix: set the text color to{" "}
            <span className="font-mono">{fix.fg}</span> →{" "}
            <span className="font-mono">{fix.ratio.toFixed(2)}:1</span>
          </p>
          <Button size="sm" onClick={() => onApply(element.selector, fix.fg)}>
            Apply fix
          </Button>
          <p className="text-xs font-mono text-muted-foreground break-all">
            {element.selector} {"{ color: "}
            {fix.fg}
            {" }"}
          </p>
        </div>
      )}
    </div>
  );
}
