"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { KeyboardStep } from "@/lib/explore/types";
import { cn } from "@/lib/utils";

interface KeyboardReplayProps {
  steps: KeyboardStep[];
  current: number;
  playing: boolean;
  focusTrap: boolean;
  missingFocusStyle: boolean;
  tabOrderMismatch: boolean;
  onPlayPause: () => void;
  onStep: (index: number) => void;
}

export function KeyboardReplay({
  steps,
  current,
  playing,
  focusTrap,
  missingFocusStyle,
  tabOrderMismatch,
  onPlayPause,
  onStep,
}: KeyboardReplayProps) {
  return (
    <div data-testid="keyboard-replay" className="p-4 space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onPlayPause}>
          {playing ? "Pause" : "Play"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={current <= 0}
          onClick={() => onStep(current - 1)}
        >
          Prev
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={current >= steps.length - 1}
          onClick={() => onStep(current + 1)}
        >
          Next
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(focusTrap || missingFocusStyle || tabOrderMismatch) && (
          <span className="text-xs text-muted-foreground w-full">Flags:</span>
        )}
        {focusTrap && <Badge variant="outline">Focus trap</Badge>}
        {missingFocusStyle && <Badge variant="outline">Missing focus style</Badge>}
        {tabOrderMismatch && <Badge variant="outline">Tab-order mismatch</Badge>}
      </div>

      <div data-testid="keyboard-steps" className="space-y-1">
        {steps.map((s, i) => (
          <button
            key={s.selector}
            data-testid={`keyboard-step-${i}`}
            onClick={() => onStep(i)}
            className={cn(
              "w-full text-left flex items-center gap-2 px-2 py-1 rounded border transition-colors",
              i === current ? "bg-accent border-primary/40" : "hover:bg-accent/50 border-transparent"
            )}
          >
            <span className="font-mono text-xs w-6 text-muted-foreground">{i + 1}.</span>
            <span className="truncate">{s.label || s.selector}</span>
          </button>
        ))}
        {steps.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No focusable elements found. Press &ldquo;Play&rdquo; to walk the tab order.
          </p>
        )}
      </div>
    </div>
  );
}
