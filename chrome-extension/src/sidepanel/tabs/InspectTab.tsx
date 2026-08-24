import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { contrastRatio, contrastVerdict } from "@/lib/contrast";
import { callTab } from "../lib/tab-bridge";
import type { InspectedElement, FocusableStep, ContrastPairSample } from "../lib/inspect-types";

type Section = "pick" | "keyboard" | "contrast";

export function InspectTab() {
  const [section, setSection] = useState<Section>("pick");

  // -- click-to-pick --
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<InspectedElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(msg: { type?: string; element?: InspectedElement | null }) {
      if (msg?.type === "picked") setPicked(msg.element ?? null);
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  const togglePicking = useCallback(async () => {
    setError(null);
    try {
      if (picking) {
        await callTab("stop-pick-mode");
        setPicking(false);
      } else {
        await callTab("start-pick-mode");
        setPicking(true);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [picking]);

  // -- focusables / keyboard walkthrough --
  const [steps, setSteps] = useState<FocusableStep[]>([]);
  const [current, setCurrent] = useState(0);
  const [kbSummary, setKbSummary] = useState<{
    focusableCount: number;
    missingIndicatorCount: number;
    unreachableCount: number;
  } | null>(null);

  const loadFocusables = useCallback(async () => {
    setError(null);
    try {
      const [items, summary] = await Promise.all([
        callTab<FocusableStep[]>("focusables"),
        callTab<{ focusableCount: number; missingIndicatorCount: number; unreachableCount: number }>(
          "keyboard-walkthrough"
        ),
      ]);
      setSteps(items);
      setCurrent(0);
      setKbSummary(summary);
      if (items.length > 0) {
        const selector = items[0].selector;
        callTab("focus-el", { selector })
          .catch(() => {})
          .then(() => callTab("highlight", { selector }))
          .catch(() => {});
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const stepTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= steps.length) return;
      setCurrent(index);
      const selector = steps[index].selector;
      // Sequenced, not parallel: highlight() does its own scrollIntoView and
      // reads the element's rect right after -- racing it against focus-el's
      // own scroll left the overlay landing on stale coordinates.
      callTab("focus-el", { selector })
        .catch(() => {})
        .then(() => callTab("highlight", { selector }))
        .catch(() => {});
    },
    [steps]
  );

  // -- contrast pairs --
  const [pairs, setPairs] = useState<ContrastPairSample[]>([]);
  const loadContrastPairs = useCallback(async () => {
    setError(null);
    try {
      setPairs(await callTab<ContrastPairSample[]>("contrast-pairs"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const pickedVerdict = picked ? contrastVerdict(contrastRatio(picked.computed.color, picked.computed.backgroundColor)) : null;

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(["pick", "keyboard", "contrast"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={section === s ? "default" : "outline"}
            className="flex-1 capitalize"
            onClick={() => setSection(s)}
          >
            {s === "pick" ? "Element" : s === "keyboard" ? "Keyboard" : "Contrast"}
          </Button>
        ))}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {section === "pick" && (
        <div className="space-y-2">
          <Button size="sm" onClick={togglePicking} variant={picking ? "destructive" : "default"} className="w-full">
            {picking ? "Stop inspecting" : "Click an element to inspect"}
          </Button>
          {picked ? (
            <Card>
              <CardContent className="space-y-1.5 text-xs pt-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{picked.role}</span>
                  <Badge variant="outline">{picked.tag}</Badge>
                </div>
                <p className="text-muted-foreground truncate">{picked.name || "(no accessible name)"}</p>
                <p className="font-mono text-[11px] text-muted-foreground truncate">{picked.selector}</p>
                {pickedVerdict && (
                  <div className="flex items-center gap-2">
                    <span>Contrast: {pickedVerdict.ratio.toFixed(2)}:1</span>
                    <Badge variant={pickedVerdict.level === "fail" ? "destructive" : "default"}>
                      {pickedVerdict.level === "fail" ? "Fails AA" : `Passes ${pickedVerdict.level}`}
                    </Badge>
                  </div>
                )}
                <p>
                  Touch target: {picked.touchTarget.width}×{picked.touchTarget.height}px
                  {Math.min(picked.touchTarget.width, picked.touchTarget.height) < 24 && (
                    <Badge variant="destructive" className="ml-1.5">below 24px</Badge>
                  )}
                </p>
                <p>Tab index: {picked.tabIndex ?? "not focusable"}</p>
              </CardContent>
            </Card>
          ) : (
            <p className="text-xs text-muted-foreground">
              {picking ? "Click any element on the page." : "Nothing selected yet."}
            </p>
          )}
        </div>
      )}

      {section === "keyboard" && (
        <div className="space-y-2">
          <Button size="sm" onClick={loadFocusables} className="w-full">
            Load focus order ({steps.length || "…"})
          </Button>
          {kbSummary && (
            <Card>
              <CardContent className="text-xs space-y-1 pt-4">
                <p>{kbSummary.focusableCount} focusable elements</p>
                {kbSummary.missingIndicatorCount > 0 && (
                  <p className="text-destructive">
                    {kbSummary.missingIndicatorCount} missing a visible focus indicator (WCAG 2.4.7)
                  </p>
                )}
                {kbSummary.unreachableCount > 0 && (
                  <p className="text-destructive">
                    {kbSummary.unreachableCount} not actually reachable by keyboard
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {steps.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <Button size="xs" variant="outline" onClick={() => stepTo(current - 1)} disabled={current <= 0}>
                  ← Prev
                </Button>
                <span className="text-muted-foreground">
                  {current + 1} / {steps.length}
                </span>
                <Button size="xs" variant="outline" onClick={() => stepTo(current + 1)} disabled={current >= steps.length - 1}>
                  Next →
                </Button>
              </div>
              <p className="text-xs font-mono truncate">{steps[current]?.label}</p>
            </div>
          )}
        </div>
      )}

      {section === "contrast" && (
        <div className="space-y-2">
          <Button size="sm" onClick={loadContrastPairs} className="w-full">
            Scan contrast pairs ({pairs.length || "…"})
          </Button>
          {pairs.length === 0 && (
            <p className="text-xs text-muted-foreground">No pairs scanned yet.</p>
          )}
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {pairs.map((p, i) => {
              const v = contrastVerdict(contrastRatio(p.fg, p.bg));
              return (
                <div key={i} className="flex items-center justify-between gap-2 text-xs border rounded px-2 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-6 h-6 rounded border shrink-0 flex items-center justify-center text-[10px] font-bold"
                      style={{ backgroundColor: p.bg, color: p.fg }}
                      title={`text ${p.fg} on background ${p.bg}`}
                    >
                      Ag
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.label}</p>
                      <p className="font-mono text-[10px] text-muted-foreground truncate">
                        {p.fg} on {p.bg}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={v.level === "fail" ? "destructive" : "default"}>
                      {v.ratio.toFixed(1)}:1 {v.level === "fail" ? "fail" : v.level}
                    </Badge>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => callTab("highlight", { selector: p.selector }).catch(() => {})}
                    >
                      Show
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
