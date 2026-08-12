"use client";

import { useRef, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { Bbox } from "@/lib/explore/types";

interface ElementPickerProps {
  active: boolean;
  disabled: boolean;
  hoverBox: Bbox | null;
  hoverLabel: string | null;
  onPointerMove: (x: number, y: number) => void;
  onPointerLeave: () => void;
  onClick: (x: number, y: number) => void;
}

export function ElementPicker({
  active,
  disabled,
  hoverBox,
  hoverLabel,
  onPointerMove,
  onPointerLeave,
  onClick,
}: ElementPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  const local = (e: MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const picking = active && !disabled;

  return (
    <div
      ref={ref}
      data-testid="element-picker"
      className={cn(
        "absolute inset-0 z-10",
        picking ? "cursor-crosshair" : "pointer-events-none"
      )}
      onMouseMove={(e) => {
        if (!picking) return;
        const c = local(e);
        if (c) onPointerMove(c.x, c.y);
      }}
      onMouseLeave={onPointerLeave}
      onClick={(e) => {
        if (!picking) return;
        const c = local(e);
        if (c) onClick(c.x, c.y);
      }}
    >
      {picking && hoverBox && (
        <div
          data-testid="picker-hover"
          className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
          style={{
            left: hoverBox.x,
            top: hoverBox.y,
            width: hoverBox.width,
            height: hoverBox.height,
          }}
        >
          {hoverLabel && (
            <span className="absolute -top-6 left-0 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded whitespace-nowrap">
              {hoverLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
