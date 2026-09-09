"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DISMISS_KEY = "able:mobile-gate-dismissed";
const BREAKPOINT_PX = 768; // matches Tailwind's `md`, and resize_window's "mobile"/"tablet" presets

/** Pages that are just content: the landing page, the legal pages, and the
 * two install pages. Nothing here needs a wide viewport, so warning about one
 * only blurs the pitch behind a modal for anyone arriving on a phone, which is
 * how most links get opened. The gate exists for the workbench, so it stays
 * on everywhere else; a new app route is gated by default. */
const UNGATED_PATHS = ["/", "/privacy", "/terms", "/extension", "/figma-plugin"];

/**
 * ScanA11y's workbench is a side-by-side, drag-to-resize desktop layout
 * (checklist + live preview + Inspect/Accessibility panels) -- it's built
 * for testing real sites at desktop viewport sizes, not for being used ON
 * a phone. Rather than let a mobile visitor hit a half-broken layout with
 * no explanation, this surfaces that plainly and lets them continue anyway
 * (dismissible, not a hard block -- WCAG 2.2 doesn't allow trapping users,
 * and someone may have a legitimate reason to proceed).
 */
export function MobileGate() {
  const [show, setShow] = useState(false);
  const pathname = usePathname();
  const gated = !UNGATED_PATHS.includes(pathname ?? "/");

  useEffect(() => {
    // Nothing to subscribe to on an ungated page. Visibility is derived below
    // rather than pushed into state here, so leaving a gated route cannot
    // cascade an extra render.
    if (!gated) return;
    function check() {
      const isNarrow = window.innerWidth < BREAKPOINT_PX;
      const dismissed = window.sessionStorage.getItem(DISMISS_KEY) === "1";
      setShow(isNarrow && !dismissed);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [gated]);

  function dismiss() {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  if (!gated || !show) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mobile-gate-title"
      aria-describedby="mobile-gate-desc"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
    >
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle id="mobile-gate-title" className="text-base">
            Built for desktop
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p id="mobile-gate-desc" className="text-sm text-muted-foreground">
            ScanA11y&apos;s workbench uses side-by-side panels and drag-to-resize
            interactions that need a wider screen to work properly. For the
            full experience, open this on a desktop or laptop browser.
          </p>
          <Button onClick={dismiss} className="w-full">
            Continue anyway
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
