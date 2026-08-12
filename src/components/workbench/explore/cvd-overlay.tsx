"use client";

import { CVD_LABELS, CVD_TYPES, type CvdFlag, type CvdType } from "@/lib/cvd";
import { cn } from "@/lib/utils";

interface CvdOverlayProps {
  type: CvdType | null;
  flags: CvdFlag[];
  onChange: (type: CvdType | null) => void;
}

export function CvdOverlay({ type, flags, onChange }: CvdOverlayProps) {
  return (
    <div data-testid="cvd-overlay" className="p-4 space-y-3 text-sm">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Color-blind simulation</p>
        <select
          data-testid="cvd-select"
          value={type ?? "none"}
          onChange={(e) => onChange(e.target.value === "none" ? null : (e.target.value as CvdType))}
          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="none">None</option>
          {CVD_TYPES.map((t) => (
            <option key={t} value={t}>
              {CVD_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {type && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Simulated — verify with real users. Never a pass/fail verdict on its own.
        </p>
      )}

      {flags.length > 0 && (
        <div data-testid="cvd-flags" className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Pairs that pass normally but fail under {type ? CVD_LABELS[type] : "simulation"}:
          </p>
          {flags.map((f, i) => (
            <div
              key={`${f.fg}-${f.bg}-${i}`}
              className={cn("text-xs font-mono rounded border px-2 py-1 bg-muted/40")}
            >
              {f.fg} on {f.bg} — {f.normalRatio.toFixed(2)}:1 → {f.cvdRatio.toFixed(2)}:1
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
