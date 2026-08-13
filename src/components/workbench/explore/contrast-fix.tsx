"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CriterionChip } from "@/components/workbench/criterion-chip";
import { contrastRatio, contrastVerdict, requiredContrastRatio, suggestFix } from "@/lib/contrast";
import { apcaVerdict } from "@/lib/apca";
import { authHeaders } from "@/lib/supabase/client";
import type { InspectedElement } from "@/lib/explore/types";

interface ContrastFixProps {
  element: InspectedElement | null;
  auditId: string;
  onApply: (selector: string, color: string) => void;
}

export function ContrastFix({ element, auditId, onApply }: ContrastFixProps) {
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

  const verdict = contrastVerdict(ratio);
  const target = requiredContrastRatio(level, largeText);
  const meetsTarget = ratio >= target;
  const fix = meetsTarget ? null : suggestFix(fg, bg, target);
  const isFlagged = flaggedSelectors.has(element.selector);

  const handleFlag = async () => {
    setFlagging(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/audits/${auditId}/contrast-finding`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          selector: element.selector,
          elementHtml: element.name ? `<span>${element.name}</span>` : undefined,
          fg,
          bg,
          bbox: element.bbox,
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
        <CriterionChip criterionId="1.4.3" />
        <CriterionChip criterionId="1.4.11" />
      </div>

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

      <div className="border-t pt-3">
        <Button
          size="sm"
          variant="outline"
          disabled={flagging || isFlagged}
          onClick={handleFlag}
        >
          {isFlagged ? "Flagged" : flagging ? "Flagging…" : "Flag finding"}
        </Button>
      </div>
    </div>
  );
}
