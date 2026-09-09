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

/** Settle time allowed after each Tab press before reading document.activeElement.
 * Measured at the previous 50ms this loop cost 65-73ms per tab, so a 99-tab
 * walk on a large site burned 7.2s — 72% of its own deadline and the second
 * most expensive stage in the whole page scan. `keyboard.press` already
 * awaits the input event's CDP round-trip; this only covers focus handlers
 * that move focus asynchronously. */
const TAB_SETTLE_MS = 10;

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
        // Tabbing scrolls the page (measured: remix.run ends a walk at
        // scrollY 7023), so viewport-relative rects recorded across a walk
        // are not in one coordinate space. checkTabOrderMismatch compares
        // them as if they were, which turns pure scrolling into phantom
        // "tab order doesn't match visual order" findings. Record document
        // coordinates instead.
        return {
          tag: el.tagName.toLowerCase(),
          selector,
          rect: {
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height,
          },
        };
      });

      if (activeInfo.tag === "body") {
        if (visitedElements.length === 0) {
          // Fresh page: focus starts on body. Press Tab once to enter the
          // page's focus order, then continue recording.
          await page.keyboard.press("Tab");
          await page.waitForTimeout(TAB_SETTLE_MS);
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

      await page.waitForTimeout(TAB_SETTLE_MS);
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
    // sampled === 0 means the page had no focusable elements (or the check
    // itself failed) — there is nothing to report, and claiming otherwise is
    // how this rule used to fire on pages with zero interactive content.
    if (missingFocusCheck.sampled > 0 && !missingFocusCheck.pass) {
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
          `No visible focus indicator was detected across ${missingFocusCheck.sampled} sampled focusable element(s), and the page ships no :focus or :focus-visible style rule. Ensure focus styles provide a visible outline.`,
        additional_instances: 0,
        bbox: null,
        evidence: { sampled: missingFocusCheck.sampled },
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

/**
 * Sample focusable elements and decide whether focusing one visibly changes
 * its rendering.
 *
 * The previous implementation held two `getComputedStyle(el)` handles and
 * compared them. `getComputedStyle` returns a LIVE CSSStyleDeclaration, so
 * both handles were views of the same element in the same (blurred) state and
 * every comparison was trivially equal — the function could only ever return
 * `pass: false`, and every audited page got a bogus serious
 * "focus-indicator-missing" finding, including pages with no focusable
 * elements at all. Reading the values out into plain strings at each moment
 * is what makes the comparison real.
 *
 * `sampled` lets the caller distinguish "we looked and found nothing" from
 * "there was nothing to look at" — only the former is reportable.
 */
async function checkFocusIndicator(
  page: Page
): Promise<{ pass: boolean; sampled: number }> {
  try {
    return await page.evaluate(() => {
      const focusables = document.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"]), textarea:not([disabled]), select:not([disabled])'
      );
      const sampleCount = Math.min(focusables.length, 30);

      // Snapshot the properties a focus style realistically touches, as a
      // plain string — not a live style handle.
      //
      // The signature is deliberately semantic rather than a raw property
      // dump: an outline's colour, width and offset paint nothing while
      // outline-style is `none`, and Chromium's UA sheet nudges
      // outline-offset from 0px to 1px on focus regardless. Comparing raw
      // values would read that as "this page has a focus indicator" on a page
      // whose whole problem is `:focus { outline: none }`. Same for a border
      // width under border-style: none.
      const snapshot = (el: Element): string => {
        const s = window.getComputedStyle(el);
        const outlineVisible =
          s.outlineStyle !== "none" &&
          s.outlineStyle !== "hidden" &&
          parseFloat(s.outlineWidth) > 0;
        const borderVisible =
          s.borderStyle !== "none" &&
          s.borderStyle !== "hidden" &&
          parseFloat(s.borderWidth) > 0;
        return [
          outlineVisible
            ? `${s.outlineStyle}/${s.outlineColor}/${s.outlineWidth}/${s.outlineOffset}`
            : "no-outline",
          borderVisible ? `${s.borderStyle}/${s.borderColor}/${s.borderWidth}` : "no-border",
          s.backgroundColor,
          s.boxShadow,
          s.color,
          s.textDecorationLine,
        ].join("|");
      };

      const previouslyFocused = document.activeElement as HTMLElement | null;
      let changed = false;

      for (let i = 0; i < sampleCount && !changed; i++) {
        const el = focusables[i] as HTMLElement;
        const blurred = snapshot(el);
        // preventScroll: focusing must not move the viewport — evidence
        // screenshots and bounding boxes are captured against scroll origin.
        el.focus({ preventScroll: true });
        const focused = snapshot(el);
        el.blur();
        if (focused !== blurred) changed = true;
      }

      previouslyFocused?.focus?.({ preventScroll: true });

      if (changed) return { pass: true, sampled: sampleCount };

      // A site may style only `:focus-visible`, which programmatic `.focus()`
      // deliberately does not match in Chromium (it is keyboard-heuristic).
      // Before claiming there is no indicator, look for a focus rule that
      // actually paints something. A rule is NOT evidence if it only removes
      // the default ring (`:focus { outline: none }`) — that is the classic
      // way sites break this criterion, and counting it would turn the check
      // inside out. Cross-origin sheets throw on cssRules access; those are
      // skipped, not read as absence.
      const paints = (style: CSSStyleDeclaration): boolean => {
        const outlineStyle = style.getPropertyValue("outline-style").trim();
        const outlineWidth = style.getPropertyValue("outline-width").trim();
        const outline = style.getPropertyValue("outline").trim();
        const widthIsZero = /^0(px)?$/.test(outlineWidth);
        // outline-style gates the whole outline: `outline: none` expands to
        // outline-style:none with outline-width reset to its `medium`
        // initial value, so width alone is not evidence of a ring.
        if (outlineStyle) {
          if (outlineStyle !== "none" && outlineStyle !== "hidden" && !widthIsZero) {
            return true;
          }
        } else if (outline && !/^(none|0|0px)$/.test(outline)) {
          return true;
        }
        for (const prop of [
          "box-shadow",
          "background-color",
          "background",
          "border",
          "border-color",
          "border-width",
          "text-decoration",
          "text-decoration-line",
          "filter",
        ]) {
          const v = style.getPropertyValue(prop);
          if (v && v !== "none") return true;
        }
        return false;
      };

      let hasFocusRule = false;
      const visit = (rules: CSSRuleList): void => {
        for (const rule of Array.from(rules)) {
          if (hasFocusRule) return;
          const nested = (rule as CSSGroupingRule).cssRules;
          if (nested) {
            // @media / @supports wrappers hold the real rules.
            visit(nested);
            continue;
          }
          const styleRule = rule as CSSStyleRule;
          const text = styleRule.selectorText;
          if (
            text &&
            /:focus(-visible|-within)?\b/.test(text) &&
            styleRule.style &&
            paints(styleRule.style)
          ) {
            hasFocusRule = true;
            return;
          }
        }
      };

      for (const sheet of Array.from(document.styleSheets)) {
        try {
          visit(sheet.cssRules);
        } catch {
          // cross-origin stylesheet — unreadable, not evidence either way
        }
        if (hasFocusRule) break;
      }

      return { pass: hasFocusRule, sampled: sampleCount };
    });
  } catch {
    // Never manufacture a finding out of our own failure to measure.
    return { pass: true, sampled: 0 };
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
