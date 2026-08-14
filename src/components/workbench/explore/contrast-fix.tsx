"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CriterionChip } from "@/components/workbench/criterion-chip";
import { contrastRatio, contrastVerdict, requiredContrastRatio, suggestFix } from "@/lib/contrast";
import { apcaVerdict } from "@/lib/apca";
import { pickContrastCriterion } from "@/lib/audit/contrast-finding";
import { authHeaders } from "@/lib/supabase/client";
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
  pageUrl,
  viewport = null,
}: ContrastFixProps) {
  const [level, setLevel] = useState<"AA" | "AAA">("AA");
  const [largeText, setLargeText] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flaggedSelectors, setFlaggedSelectors] = useState<Set<string>>(new Set());

  const fg = element?.computed.color ?? null;
  const bg = element?.computed.backgroundColor ?? null;

  const ratio = useMemo(
    () => (fg && bg ? contrastRatio(fg, bg) : null),
    [fg, bg]
  );

  const apca = useMemo(() => (fg && bg ? apcaVerdict(fg, bg) : null), [fg, bg]);

  if (!ratio || !element || !fg || !bg) {
    return (
      <div data-testid="contrast-fix-empty" className="p-4 text-sm text-muted-foreground">
        Pick an element to measure live contrast.
      </div>
    );
  }

  const verdict = contrastVerdict(ratio, largeText);
  // WCAG 1.4.11 (non-text/UI-component contrast) is a flat 3:1 floor with no
  // AA/AAA tier or large-text variant — using the text thresholds here for a
  // non-text element would report a real 1.4.11 pass as a failure.
  const target = requiredContrastRatio(level, largeText, element.hasText);
  const meetsTarget = ratio >= target;
  const fix = meetsTarget ? null : suggestFix(fg, bg, target);
  const isFlagged = flaggedSelectors.has(element.selector);
  const activeCriterion = pickContrastCriterion(element.hasText, level);

  const handleFlag = async () => {
    if (!auditId) return;
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
          level,
          largeText,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Failed to flag finding");
        return;
      }
      setFlaggedSelectors((prev) => new Set(prev).add(element.selector));
      toast.success("Contrast finding flagged");
    } catch {
      toast.error("Failed to flag finding");
    } finally {
      setFlagging(false);
    }
  };

  return (
    <div data-testid="contrast-fix" className="p-4 space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <CriterionChip criterionId={activeCriterion} />
      </div>

      {element.hasText ? (
        <div className="flex items-center gap-1 text-xs">
          {(["AA", "AAA"] as const).map((lvl) => (
            <button
              key={lvl}
              data-testid={`target-level-${lvl.toLowerCase()}`}
              onClick={() => setLevel(lvl)}
              aria-pressed={level === lvl}
              className={`px-2 py-1 rounded border transition-colors ${
                level === lvl ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent/50"
              }`}
            >
              {lvl}
            </button>
          ))}
          <span className="mx-1 text-muted-foreground">·</span>
          {([
            { key: "normal", label: "Normal text", value: false },
            { key: "large", label: "Large text", value: true },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              data-testid={`target-size-${opt.key}`}
              onClick={() => setLargeText(opt.value)}
              aria-pressed={largeText === opt.value}
              className={`px-2 py-1 rounded border transition-colors ${
                largeText === opt.value ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <p data-testid="non-text-target-note" className="text-xs text-muted-foreground">
          Non-text element — WCAG 1.4.11 requires a flat 3:1 minimum (no AA/AAA tier).
        </p>
      )}

      <div>
        <p className="text-xs text-muted-foreground">Foreground / background</p>
        <p className="font-mono">
          {fg} on {bg}
        </p>
      </div>

      <div
        data-testid="contrast-verdict"
        className={`font-semibold ${
          meetsTarget ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        }`}
      >
        {ratio.toFixed(2)}:1 —{" "}
        {meetsTarget
          ? `passes ${verdict.level === "fail" ? level : verdict.level}`
          : `fails ${level} (needs ${target.toFixed(1)}:1)`}
      </div>

      {apca && (
        <p data-testid="apca-readout" className="text-xs text-muted-foreground">
          APCA Lc {apca.lc.toFixed(1)} — {apca.label} (informational, not a WCAG pass/fail gate)
        </p>
      )}

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

      {auditId && !meetsTarget && (
        <div className="border-t pt-3">
          <Button
            size="sm"
            variant="outline"
            disabled={flagging || isFlagged}
            onClick={handleFlag}
          >
            {isFlagged ? "Flagged" : flagging ? "Flagging…" : "Flag finding"}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-1">
            Persists this {level}{largeText ? " large-text" : ""} failure into the report with crop evidence.
          </p>
        </div>
      )}
    </div>
  );
}
