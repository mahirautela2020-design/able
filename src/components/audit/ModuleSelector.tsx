"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AUDIT_MODULES,
  formatRuntime,
  getRequiredModuleIds,
  type AuditModule,
  type ModuleSelection,
} from "@/lib/audit-modules";

interface ModuleSelectorProps {
  selected: ModuleSelection[];
  onChange: (selected: ModuleSelection[]) => void;
}

export function ModuleSelector({ selected, onChange }: ModuleSelectorProps) {
  const requiredIds = getRequiredModuleIds();

  function isEnabled(moduleId: string): boolean {
    const sel = selected.find((s) => s.moduleId === moduleId);
    return sel?.enabled ?? false;
  }

  function isRequired(moduleId: string): boolean {
    return requiredIds.includes(moduleId);
  }

  function toggle(moduleId: string) {
    if (isRequired(moduleId)) return;
    const next = selected.map((s) =>
      s.moduleId === moduleId ? { ...s, enabled: !s.enabled } : s
    );
    onChange(next);
  }

  const selectedCount = selected.filter((s) => s.enabled).length;
  const totalRuntime = AUDIT_MODULES.filter((m) =>
    selected.find((s) => s.moduleId === m.id)?.enabled
  ).reduce((sum, m) => sum + m.estimatedRuntimeMs, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {selectedCount} of {AUDIT_MODULES.length} modules selected
          </p>
          {totalRuntime > 0 && (
            <p className="text-xs text-muted-foreground">
              Est. runtime: {formatRuntime(totalRuntime)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onChange(AUDIT_MODULES.map((m) => ({ moduleId: m.id, enabled: true })))
            }
          >
            Select all
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onChange(
                AUDIT_MODULES.map((m) => ({
                  moduleId: m.id,
                  enabled: isRequired(m.id),
                }))
              )
            }
          >
            None
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {AUDIT_MODULES.map((mod) => (
          <ModuleCard
            key={mod.id}
            module={mod}
            enabled={isEnabled(mod.id)}
            required={isRequired(mod.id)}
            onToggle={() => toggle(mod.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ModuleCard({
  module: mod,
  enabled,
  required,
  onToggle,
}: {
  module: AuditModule;
  enabled: boolean;
  required: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={required ? undefined : onToggle}
      onKeyDown={(e) => {
        if (!required && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onToggle();
        }
      }}
      tabIndex={required ? -1 : 0}
      role="switch"
      aria-checked={enabled}
      className={cn(
        "text-left rounded-xl border-2 p-4 transition-all w-full",
        "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        enabled
          ? "border-primary bg-primary/5"
          : "border-border bg-background",
        required && "cursor-not-allowed opacity-80"
      )}
      data-testid={`module-${mod.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{mod.name}</span>
            {required && (
              <Badge variant="secondary" className="text-xs">
                Required
              </Badge>
            )}
            {mod.optional && (
              <Badge variant="outline" className="text-xs">
                Optional
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {mod.description}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
        <span>{mod.engine}</span>
        <span aria-hidden="true">·</span>
        <span>{mod.wcagScIds.length} SCs</span>
        {mod.estimatedRuntimeMs > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{formatRuntime(mod.estimatedRuntimeMs)}</span>
          </>
        )}
      </div>
    </div>
  );
}
