"use client";

import type { ExploreController } from "./use-explore";
import { InspectorPanel } from "./inspector-panel";
import { ContrastFix } from "./contrast-fix";
import { KeyboardReplay } from "./keyboard-replay";
import { CvdOverlay } from "./cvd-overlay";
import { AxTreePanel } from "./ax-tree-panel";

/**
 * Inspect tools, rendered in the workbench's LEFT column. Drives the shared
 * preview iframe (right column) through the `ExploreController` returned by
 * useExplore — the picker overlays live on the preview, the controls live
 * here.
 */
export function InspectRail({ ctrl }: { ctrl: ExploreController }) {
  return (
    <div className="h-full overflow-y-auto" data-testid="inspect-rail">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <span className="text-sm font-semibold">Element Inspector</span>
        <button
          onClick={() => {
            ctrl.setPickerActive((v) => !v);
            if (ctrl.pickerActive) {
              ctrl.setHoverBox(null);
              ctrl.setHoverLabel(null);
            }
          }}
          className="text-xs px-2 py-1 rounded border hover:bg-accent/50 transition-colors"
        >
          {ctrl.pickerActive ? "Stop picking" : "Pick element"}
        </button>
      </div>

      {ctrl.pickerDisabled && (
        <p className="px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-b">
          This target can&apos;t be inspected in-place (the preview is a static
          snapshot or the site blocks it). Element picking, live contrast, and
          keyboard replay need the interactive proxy preview.
        </p>
      )}

      <section className="border-b">
        <SectionTitle title="Inspector" />
        <InspectorPanel element={ctrl.picked} />
      </section>

      <section className="border-b">
        <SectionTitle title="Live contrast" />
        <ContrastFix
          element={ctrl.picked}
          auditId={ctrl.auditId}
          pageUrl={ctrl.targetUrl}
          viewport={ctrl.pickedViewport}
          onApply={ctrl.handleApplyFix}
        />
      </section>

      <section className="border-b">
        <SectionTitle
          title="Keyboard replay"
          action={
            <button onClick={ctrl.loadFocusables} className="text-xs text-primary hover:underline">
              Scan focusables
            </button>
          }
        />
        <KeyboardReplay
          steps={ctrl.steps}
          current={ctrl.current}
          playing={ctrl.playing}
          focusTrap={ctrl.focusFlags.trap}
          missingFocusStyle={ctrl.focusFlags.missingStyle}
          tabOrderMismatch={ctrl.focusFlags.orderMismatch}
          onPlayPause={() => ctrl.setPlaying((v) => !v)}
          onStep={ctrl.stepTo}
        />
      </section>

      <section className="border-b">
        <SectionTitle title="Color-blind simulation" />
        <CvdOverlay type={ctrl.cvd} flags={ctrl.cvdFlags} onChange={ctrl.handleCvdChange} />
      </section>

      <section>
        <SectionTitle title="Accessibility tree" />
        <AxTreePanel
          snapshot={ctrl.axSnapshot}
          loading={ctrl.axLoading}
          error={ctrl.axError}
          onSelectNode={ctrl.handleSelectNode}
        />
      </section>
    </div>
  );
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {action}
    </div>
  );
}
