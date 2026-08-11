import type { Page } from "playwright-core";
import type { Finding } from "@/engine/axe-scan";

export interface KeyboardResult {
  findings: Finding[];
  focusableCount: number;
  tabSequence: Array<{ selector: string; bbox: { x: number; y: number; width: number; height: number } | null }>;
  deadEndBeforeCompletion: boolean;
  focusTrapDetected: boolean;
  focusIndicatorMissing: boolean;
}

export async function runKeyboard(
  page: Page
): Promise<KeyboardResult> {
  const startTime = Date.now();
  const deadline = 10_000;
  const result: KeyboardResult = {
    findings: [],
    focusableCount: 0,
    tabSequence: [],
    deadEndBeforeCompletion: false,
    focusTrapDetected: false,
    focusIndicatorMissing: false,
  };

  try {
    const focusableCount = await page.evaluate(() => {
      const selectors = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ];
      const elements = document.querySelectorAll(selectors.join(","));
      const visible: Element[] = [];
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        ) {
          visible.push(el);
        }
      }
      return visible.length;
    });

    result.focusableCount = focusableCount;

    const maxTabs = Math.min(2 * focusableCount, 100);
    const visitedElements: Array<{ selector: string; bbox: { x: number; y: number; width: number; height: number } | null }> = [];
    const key = "focusable-count-" + Math.random();

    await page.evaluate(
      ({ key }: { key: string }) => {
        const count = document.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ).length;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)[key] = count;
      },
      { key }
    );

    const fullFocusableCount = await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ key }: { key: string }) => (window as any)[key],
      { key }
    ) as number;

    for (let i = 0; i < maxTabs; i++) {
      if (Date.now() - startTime > deadline) break;

      const activeInfo = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) {
          return { tag: "body", selector: "body", rect: null };
        }
        let selector = el.tagName.toLowerCase();
        if (el.id) selector = "#" + el.id;
        else if (el.className && typeof el.className === "string") {
          const cls = el.className
            .split(" ")
            .filter((c) => c)
            .slice(0, 2)
            .join(".");
          if (cls) selector = el.tagName.toLowerCase() + "." + cls;
        }
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          selector,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      });

      if (activeInfo.tag === "body") {
        if (visitedElements.length === 0) {
          // Fresh page: focus starts on body. Press Tab once to enter the
          // page's focus order, then continue recording.
          await page.keyboard.press("Tab");
          await page.waitForTimeout(50);
          continue;
        }
        // Focus left the document (wrapped past the last focusable) — cycle done.
        break;
      }

      const bbox = activeInfo.rect
        ? { x: activeInfo.rect.x, y: activeInfo.rect.y, width: activeInfo.rect.width, height: activeInfo.rect.height }
        : null;

      visitedElements.push({ selector: activeInfo.selector, bbox });

      await page.keyboard.press("Tab");

      await page.waitForTimeout(50);
    }

    result.tabSequence = visitedElements;

    if (visitedElements.length > 1) {
      const selectorSequence = visitedElements.map((v) => v.selector);
      const trapDetected = detectFocusTrap(selectorSequence, fullFocusableCount);

      if (trapDetected) {
        result.focusTrapDetected = true;
        result.findings.push({
          bucket: "needs_review",
          rule_id: "keyboard-focus-trap",
          rule_title: "Potential keyboard focus trap detected",
          wcag_criteria: ["2.1.2"],
          wcag_criterion: "2.1.2",
          wcag_level: "A",
          principle: "Operable",
          severity: "serious",
          confidence: 0.5,
          source_engines: ["keyboard-walkthrough"],
          selector: "body",
          element_html: "",
          failure_summary:
            "A potential focus trap was detected. The keyboard focus cycled through elements without covering all focusable elements. Note: modal dialogs legitimately trap focus.",
          additional_instances: 0,
          bbox: null,
          evidence: {
            sequence: visitedElements.map((v) => ({ selector: v.selector })),
          },
          engine_version: null,
        });
      }
    }

    const missingFocusCheck = await checkFocusIndicator(page);
    if (!missingFocusCheck.pass) {
      result.focusIndicatorMissing = true;
      result.findings.push({
        bucket: "needs_review",
        rule_id: "focus-indicator-missing",
        rule_title: "Focus indicator may not be visible",
        wcag_criteria: ["2.4.7"],
        wcag_criterion: "2.4.7",
        wcag_level: "AA",
        principle: "Operable",
        severity: "serious",
        confidence: 0.5,
        source_engines: ["keyboard-walkthrough"],
        selector: "body",
        element_html: "",
        failure_summary:
          "No visible focus indicator was detected on one or more focusable elements. Ensure :focus and :focus-visible styles provide visible outlines.",
        additional_instances: 0,
        bbox: null,
        evidence: {},
        engine_version: null,
      });
    }

    const visualTabOrderMismatch = checkTabOrderMismatch(visitedElements);
    if (visualTabOrderMismatch) {
      result.findings.push({
        bucket: "needs_review",
        rule_id: "tab-order-mismatch",
        rule_title: "Tab order may not match visual order",
        wcag_criteria: ["2.4.3"],
        wcag_criterion: "2.4.3",
        wcag_level: "A",
        principle: "Operable",
        severity: "serious",
        confidence: 0.3,
        source_engines: ["keyboard-walkthrough"],
        selector: "body",
        element_html: "",
        failure_summary:
          "The DOM tab order appears to differ from the visual order. Multi-column layouts, RTL text, and sticky headers can cause intentional differences — human review required.",
        additional_instances: 0,
        bbox: null,
        evidence: {},
        engine_version: null,
      });
    }
  } catch {
    result.deadEndBeforeCompletion = true;
  }

  return result;
}

function detectFocusTrap(
  sequence: string[],
  fullFocusableCount: number
): boolean {
  if (sequence.length < 4 || fullFocusableCount <= 2) return false;

  const visited = new Set(sequence);
  if (visited.size >= fullFocusableCount) return false;

  // Strict sub-cycle detection: if the tail of the sequence repeats with a
  // fixed period AND the visited set never covered all focusables, focus is
  // cycling inside a subset — a trap. (Modal dialogs legitimately trap focus;
  // the finding routes to needs_review, never to fail.)
  const half = Math.floor(sequence.length / 2);
  for (let p = 1; p <= half; p++) {
    const tail = sequence.slice(sequence.length - p);
    const prev = sequence.slice(sequence.length - 2 * p, sequence.length - p);
    if (tail.join("\u0000") === prev.join("\u0000")) {
      return true;
    }
  }

  return false;
}

async function checkFocusIndicator(
  page: Page
): Promise<{ pass: boolean }> {
  try {
    const result = await page.evaluate(() => {
      const focusables = document.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"]), textarea:not([disabled]), select:not([disabled])'
      );
      const sampleCount = Math.min(focusables.length, 30);

      for (let i = 0; i < sampleCount; i++) {
        const el = focusables[i] as HTMLElement;
        el.focus();
        const before = window.getComputedStyle(el);
        el.blur();
        const after = window.getComputedStyle(el);

        const outlineChanged =
          before.outlineStyle !== after.outlineStyle ||
          before.outlineColor !== after.outlineColor ||
          before.outlineWidth !== after.outlineWidth;
        const bgChanged =
          before.backgroundColor !== after.backgroundColor;
        const borderChanged =
          before.borderColor !== after.borderColor ||
          before.borderWidth !== after.borderWidth;

        if (outlineChanged || bgChanged || borderChanged) {
          return { pass: true };
        }
      }

      return { pass: false };
    });
    return result;
  } catch {
    return { pass: true };
  }
}

function checkTabOrderMismatch(
  sequence: Array<{ selector: string; bbox: { x: number; y: number; width: number; height: number } | null }>
): boolean {
  const valid = sequence.filter((s) => s.bbox);
  if (valid.length < 2) return false;

  let yMismatches = 0;
  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1].bbox!;
    const curr = valid[i].bbox!;

    if (
      prev.y + prev.height < curr.y &&
      curr.x + curr.width < prev.x
    ) {
      yMismatches++;
    }
  }

  return yMismatches >= 2;
}
