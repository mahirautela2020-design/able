"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  MODULE_PRESETS,
  type ModulePreset,
  AUDIT_MODULES,
  totalEstimatedRuntime,
  formatRuntime,
  getRequiredModuleIds,
} from "@/lib/audit-modules";

interface AuditPresetsProps {
  selectedPresetId: string | null;
  onSelect: (presetId: string) => void;
}

export function AuditPresets({ selectedPresetId, onSelect }: AuditPresetsProps) {
  const requiredIds = getRequiredModuleIds();

  function presetModuleIds(preset: ModulePreset): string[] {
    const allIds = new Set([...requiredIds, ...preset.moduleIds]);
    return AUDIT_MODULES.filter((m) => allIds.has(m.id)).map((m) => m.id);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {MODULE_PRESETS.map((preset) => {
        const ids = presetModuleIds(preset);
        const runtime = totalEstimatedRuntime(ids);
        const isSelected = selectedPresetId === preset.id;

        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.id)}
            className={cn(
              "text-left rounded-xl border-2 p-4 transition-all",
              "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSelected
                ? "border-primary bg-primary/10"
                : "border-border bg-card"
            )}
            data-testid={`preset-${preset.id}`}
            aria-pressed={isSelected}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{preset.name}</span>
              {isSelected && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  Active
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
              {preset.description}
            </p>
            <div className="text-xs text-muted-foreground">
              <span>{ids.length} modules</span>
              {runtime > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>~{formatRuntime(runtime)}</span>
                </>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
