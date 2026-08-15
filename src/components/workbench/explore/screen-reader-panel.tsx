"use client";

import { SrPreview } from "@/components/workbench/sr-preview";
import { NvdaPanel } from "@/components/workbench/nvda-panel";

/**
 * Screen Reader mode: the deterministic AX-tree transcript (works for every
 * user, every deployment) plus the optional real-NVDA-on-localhost check,
 * together in one full-width panel instead of two sections stacked below
 * the whole workbench.
 */
export function ScreenReaderPanel({
  auditId,
  targetUrl,
}: {
  auditId: string;
  targetUrl: string;
}) {
  return (
    <div className="h-full overflow-y-auto divide-y" data-testid="screen-reader-panel">
      <SrPreview auditId={auditId} targetUrl={targetUrl} />
      <NvdaPanel auditId={auditId} />
    </div>
  );
}
