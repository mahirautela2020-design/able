"use client";

import { CriterionChip } from "@/components/workbench/criterion-chip";
import { mapElementToScs } from "@/lib/explore/wcag-map";
import type { InspectedElement } from "@/lib/explore/types";

interface InspectorPanelProps {
  element: InspectedElement | null;
}

export function InspectorPanel({ element }: InspectorPanelProps) {
  if (!element) {
    return (
      <div data-testid="inspector-empty" className="p-4 text-sm text-muted-foreground">
        Hover an element in the preview to inspect its accessibility profile.
      </div>
    );
  }

  const scs = mapElementToScs(element);
  const ariaKeys = Object.keys(element.aria);

  return (
    <div data-testid="inspector-panel" className="p-4 space-y-3 text-sm">
      <Row label="Accessible name" value={element.name || "(none)"} />
      <Row label="Role" value={element.role} mono />
      <Row label="Tag" value={`<${element.tag}>`} mono />

      {ariaKeys.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">ARIA attributes</p>
          <ul className="mt-0.5 space-y-0.5 font-mono text-xs">
            {ariaKeys.map((k) => (
              <li key={k}>
                <span className="text-muted-foreground">{k}</span>=
                <span>&quot;{element.aria[k]}&quot;</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Row label="Font size" value={element.fontSize} mono />
      <Row
        label="Touch target"
        value={`${element.touchTarget.width}×${element.touchTarget.height}`}
        mono
      />
      <Row label="Tab order index" value={element.tabIndex === null ? "—" : String(element.tabIndex)} mono />
      <Row label="Ancestors" value={element.ancestors.length ? element.ancestors.join(" > ") : "(root)"} />

      {scs.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Mapped WCAG criteria</p>
          <div className="flex flex-wrap gap-1.5">
            {scs.map((id) => (
              <CriterionChip key={id} criterionId={id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono" : "font-medium"}>{value}</p>
    </div>
  );
}
