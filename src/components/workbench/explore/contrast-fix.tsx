"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CriterionChip } from "@/components/workbench/criterion-chip";
import { authHeaders } from "@/lib/supabase/client";
import {
  CONTRAST_TARGETS,
  CONTRAST_TARGET_LABELS,
  contrastRatio,
  contrastVerdict,
  suggestFix,
  type ContrastTargetKey,
} from "@/lib/contrast";
import { apcaContrast, apcaBand } from "@/lib/apca";
import type { InspectedElement } from "@/lib/explore/types";

interface ContrastFixProps {
  element: InspectedElement | null;
  onApply: (selector: string, color: string) => void;
  /** Real audit id + page URL + iframe viewport — required for "Flag
   * finding" to persist evidence. When auditId is null (e.g. the disconnected
   * demo fixture route), the button is hidden rather than left to fail. */
  auditId?: string | null;
  pageUrl?: string;
  viewport?: { width: number; height: number } | null;
}

export function ContrastFix({
  element,
  onApply,
  auditId = null,
  pageUrl = "",
  viewport = null,
}: ContrastFixProps) {
  const [target, setTarget] = useState<ContrastTargetKey>("AA_NORMAL");
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  const fg = element?.computed.color ?? null;
  const bg = element?.computed.backgroundColor ?? null;

  const ratio = useMemo(
    () => (fg && bg ? contrastRatio(fg, bg) : null),
    [fg, bg]
  );

  const lc = useMemo(
    () => (fg && bg ? apcaContrast(fg, bg) : null),
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
  const targetRatio = CONTRAST_TARGETS[target];
  const fix = ratio < targetRatio ? suggestFix(fg!, bg!, targetRatio) : null;
  const alreadyFlagged = flagged.has(element.selector);

  async function handleFlag() {
    if (!auditId || !element || !fg || !bg) return;
    setFlagging(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/audits/${auditId}/contrast-finding`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          pageUrl,
          selector: element.selector,
          elementHtml: `<${element.tag}>`,
          fg,
          bg,
          hasText: element.hasText,
          bbox: element.bbox,
          viewport,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to flag finding");
      toast.success(`Flagged ${json.criterion} finding (${json.ratio.toFixed(2)}:1)`);
      setFlagged((prev) => new Set(prev).add(element.selector));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to flag finding");
    } finally {
      setFlagging(false);
    }
  }

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

      {lc !== null && (
        <div data-testid="apca-readout" className="text-xs text-muted-foreground">
          APCA Lc {lc.toFixed(1)} ({apcaBand(lc)}) — informational, not a WCAG 2.2 requirement
        </div>
      )}

      <div>
        <p className="text-xs text-muted-foreground mb-1">Nearest-fix target</p>
        <select
          data-testid="contrast-target-select"
          value={target}
          onChange={(e) => setTarget(e.target.value as ContrastTargetKey)}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs"
        >
          {(Object.keys(CONTRAST_TARGET_LABELS) as ContrastTargetKey[]).map((key) => (
            <option key={key} value={key}>
              {CONTRAST_TARGET_LABELS[key]}
            </option>
          ))}
        </select>
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

      {!verdict.passesAA && auditId && (
        <div className="border-t pt-3">
          <Button
            size="sm"
            variant="outline"
            data-testid="flag-finding"
            disabled={flagging || alreadyFlagged}
            onClick={handleFlag}
          >
            {alreadyFlagged ? "Flagged ✓" : flagging ? "Flagging…" : "Flag finding"}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-1">
            Persists this AA failure into the report with crop evidence.
          </p>
        </div>
      )}
    </div>
  );
}
