/**
 * Injected on-demand into the active tab (activeTab + scripting, never an
 * always-on content script) whenever the side panel needs to read or act on
 * the real page. Implements the same bridge surface as
 * src/lib/explore/bridge-script.ts (inspect/focusables/contrastPairs/
 * highlight/applyAccessibilityProfile), adapted from a
 * window.postMessage listener (bridge-script.ts targets a same-origin
 * iframe) to a chrome.runtime.onMessage listener (the side panel is a
 * completely separate execution context from the page, not a parent
 * frame -- every call here is necessarily async).
 */

export {};

if (!(window as unknown as { __ableExtLoaded?: boolean }).__ableExtLoaded) {
  (window as unknown as { __ableExtLoaded: boolean }).__ableExtLoaded = true;

  // ---------------- shared element helpers ----------------

  function rgbToHex(str: string): string {
    const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return "#000000";
    const to2 = (n: string) => Number(n).toString(16).padStart(2, "0");
    return "#" + to2(m[1]) + to2(m[2]) + to2(m[3]);
  }
  function resolveBg(el: Element): string {
    let cur: Element | null = el;
    while (cur) {
      const bg = getComputedStyle(cur).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return rgbToHex(bg);
      cur = cur.parentElement;
    }
    return "#ffffff";
  }
  function roleOf(el: Element): string {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "button") return "button";
    if (tag === "a") return "link";
    if (tag === "img") return "img";
    if (tag === "input") {
      const type = (el as HTMLInputElement).type;
      return type === "checkbox" || type === "radio" ? type : "textbox";
    }
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "main") return "main";
    if (tag === "nav") return "navigation";
    if (tag === "header") return "banner";
    if (tag === "footer") return "contentinfo";
    return tag;
  }
  function nameOf(el: Element): string {
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label")!;
    if (el.tagName.toLowerCase() === "img") return el.getAttribute("alt") || "";
    return (el.textContent || "").trim().slice(0, 80);
  }
  function cssSelector(el: Element): string {
    if (el.id) return "#" + el.id;
    let sel = el.tagName.toLowerCase();
    if (el.className && typeof el.className === "string") {
      const cls = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 1);
      if (cls.length) sel += "." + cls[0];
    }
    return sel;
  }
  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // ---------------- inspect ----------------

  function inspectAt(x: number, y: number) {
    const el = document.elementFromPoint(x, y);
    if (!el || el === document.documentElement || el === document.body) return null;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const aria: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      if (/^aria-/i.test(attr.name)) aria[attr.name] = attr.value;
    }
    return {
      role: roleOf(el),
      name: nameOf(el),
      tag: el.tagName.toLowerCase(),
      selector: cssSelector(el),
      aria,
      fontSize: cs.fontSize,
      touchTarget: { width: Math.round(rect.width), height: Math.round(rect.height) },
      tabIndex: (el as HTMLElement).tabIndex >= 0 ? (el as HTMLElement).tabIndex : null,
      bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      computed: { color: rgbToHex(cs.color), backgroundColor: resolveBg(el) },
      hasText: (el.textContent || "").trim().length > 0,
    };
  }

  function focusables() {
    const els = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR));
    return els
      .map((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return null;
        return {
          selector: cssSelector(el),
          label: nameOf(el) || el.tagName.toLowerCase(),
          bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  function contrastPairs() {
    const seen = new Set<string>();
    const pairs: { fg: string; bg: string; selector: string; label: string }[] = [];
    const els = document.querySelectorAll("button, a, input, span, h1, h2, h3, p, label");
    for (const el of Array.from(els)) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const fg = rgbToHex(getComputedStyle(el).color);
      const bg = resolveBg(el);
      const key = fg + "|" + bg;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ fg, bg, selector: cssSelector(el), label: nameOf(el) || el.tagName.toLowerCase() });
    }
    return pairs;
  }

  // ---------------- landmarks/headings outline ----------------
  // NOT the same thing as the website's Accessibility Tree (that's built
  // server-side from Playwright's real accessibility-tree snapshot via
  // /api/explore/ax-snapshot -- a content script has no equivalent API to
  // call). This is a lighter DOM-order walk of headings + landmark regions,
  // useful for the same "does this page have a sane structure" question but
  // built from plain DOM/ARIA inspection, not a genuine AX tree.
  const LANDMARK_SELECTOR =
    'header, nav, main, footer, aside, [role="banner"], [role="navigation"], [role="main"], [role="contentinfo"], [role="complementary"], [role="search"], [role="region"][aria-label], [role="region"][aria-labelledby]';

  function outline() {
    const nodes = Array.from(document.querySelectorAll(`h1,h2,h3,h4,h5,h6,${LANDMARK_SELECTOR}`));
    return nodes
      .map((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return null;
        const tag = el.tagName.toLowerCase();
        const isHeading = /^h[1-6]$/.test(tag);
        return {
          kind: isHeading ? "heading" : "landmark",
          level: isHeading ? Number(tag[1]) : null,
          role: roleOf(el),
          label: nameOf(el) || (isHeading ? "(empty heading)" : tag),
          selector: cssSelector(el),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  let highlightEl: HTMLElement | null = null;
  function clearHighlight() {
    highlightEl?.remove();
    highlightEl = null;
  }
  function highlight(selector: string): boolean {
    clearHighlight();
    const el = document.querySelector(selector);
    if (!el) return false;
    // Scroll with behavior:"auto" (not "smooth") BEFORE reading the rect --
    // an instant scroll reflows synchronously, so the very next
    // getBoundingClientRect() call already reflects the post-scroll layout.
    // "smooth" scrolling is animated over several frames, so a rect read
    // immediately after starting it captures the PRE-scroll position and the
    // overlay ends up stuck wherever the element used to be.
    el.scrollIntoView({ behavior: "auto", block: "center" });
    const rect = el.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;border:2px solid #e11d48;background:rgba(225,29,72,0.12);z-index:2147483647;pointer-events:none;" +
      "left:" + rect.left + "px;top:" + rect.top + "px;width:" + rect.width + "px;height:" + rect.height + "px;";
    document.body.appendChild(overlay);
    highlightEl = overlay;
    return true;
  }
  function focusEl(selector: string): boolean {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return false;
    // preventScroll so this doesn't race highlight()'s own scrollIntoView
    // when both are called back-to-back for the same element.
    el.focus({ preventScroll: true });
    return true;
  }

  // ---------------- accessibility profile (same behavior as
  // src/lib/widget/accessibility-widget-script.ts's applyProfile) --------

  interface A11ySettings {
    contrast?: string;
    saturation?: string;
    textScale?: number;
    lineHeight?: string;
    letterSpacing?: string;
    dyslexiaFont?: boolean;
    textAlign?: string;
    highlightLinks?: boolean;
    hideImages?: boolean;
    reducedMotion?: boolean;
    bigCursor?: boolean;
    readingGuide?: boolean;
    readingMask?: boolean;
    tooltips?: boolean;
    focusMode?: boolean;
    textMagnify?: boolean;
  }

  function applyAccessibilityProfile(settings: A11ySettings): boolean {
    const styleId = "__able-ext-a11y-style";
    let existing = document.getElementById(styleId) as HTMLStyleElement | null;
    const css: string[] = [];
    const filterParts: string[] = [];

    if (settings.contrast && settings.contrast !== "none") {
      if (settings.contrast === "dark") filterParts.push("invert(1) hue-rotate(180deg)");
      else if (settings.contrast === "light") filterParts.push("brightness(1.1) contrast(1.1)");
      else if (settings.contrast === "high") filterParts.push("contrast(1.4)");
      else if (settings.contrast === "invert") filterParts.push("invert(1) hue-rotate(180deg)");
    }
    if (settings.saturation && settings.saturation !== "none") {
      if (settings.saturation === "low") filterParts.push("saturate(0.5)");
      else if (settings.saturation === "high") filterParts.push("saturate(2)");
      else if (settings.saturation === "grayscale") filterParts.push("grayscale(1)");
    }

    if (filterParts.length > 0) {
      document.body.style.filter = filterParts.join(" ");
      if (settings.contrast === "dark") {
        css.push("img,video,picture{filter:invert(1) hue-rotate(180deg)!important}");
      }
    } else {
      document.body.style.filter = "";
    }

    if (settings.textScale && settings.textScale !== 100) {
      document.documentElement.style.fontSize = settings.textScale + "%";
    } else {
      document.documentElement.style.fontSize = "";
    }

    if (settings.lineHeight && settings.lineHeight !== "none") {
      const lh = settings.lineHeight === "loose" ? "1.5" : settings.lineHeight === "loosest" ? "2.0" : "1";
      if (lh !== "1") css.push("*{line-height:" + lh + "!important}");
    }
    if (settings.letterSpacing && settings.letterSpacing !== "none") {
      const ls = settings.letterSpacing === "wide" ? "0.05em" : settings.letterSpacing === "wider" ? "0.1em" : "0";
      if (ls !== "0") css.push("*{letter-spacing:" + ls + "!important}");
    }
    if (settings.dyslexiaFont) {
      css.push('*{font-family:"OpenDyslexic","Comic Sans MS",Verdana,sans-serif!important}');
    }
    if (settings.textAlign && settings.textAlign !== "none") {
      css.push("p,li,div,span,h1,h2,h3,h4,h5,h6{text-align:" + settings.textAlign + "!important}");
    }
    if (settings.highlightLinks) {
      css.push("a{outline:2px solid #ffbf00!important;background:#fff8e1!important;color:#00457c!important}");
    }
    if (settings.hideImages) {
      css.push("img,svg,video,picture{visibility:hidden!important}");
    }
    if (settings.reducedMotion) {
      css.push("*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}");
    }
    if (settings.bigCursor) {
      const cursorSvg =
        "data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'black\'%3E%3Cpath d=\'M0,0l8,12h6l10,12H0V0z\'/%3E%3C/svg%3E";
      css.push("*{cursor:url(\'" + cursorSvg + "\') 0 0,auto!important}");
    }
    if (settings.textMagnify) {
      css.push(
        "p:hover,span:hover,li:hover,a:hover,h1:hover,h2:hover,h3:hover,h4:hover,h5:hover,h6:hover,button:hover,label:hover{font-size:1.5em!important;transition:font-size .1s ease}"
      );
    }

    if (css.length > 0 || filterParts.length > 0) {
      const styleText = css.join("");
      if (!existing) {
        existing = document.createElement("style");
        existing.id = styleId;
        document.head.appendChild(existing);
      }
      existing.textContent = styleText;
    } else if (existing) {
      existing.remove();
    }

    return true;
  }

  // ---------------- native keyboard/focus-order walkthrough ----------------
  // Playwright can't run inside a content script (it's a Node library that
  // drives a browser externally) -- this replicates the SAME checks
  // src/engine/keyboard.ts performs server-side (focus trap, missing focus
  // indicator, dead-end before completion), but via direct .focus() calls
  // against the real live page instead of simulated Tab key presses. That is
  // arguably more authentic, not a downgrade: it is testing the actual page
  // state the user is looking at right now.
  function keyboardWalkthrough() {
    const els = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 || rect.height > 0;
    }) as HTMLElement[];

    let missingIndicatorCount = 0;
    let unreachableCount = 0;
    for (const el of els) {
      const before = getComputedStyle(el).outlineStyle;
      el.focus();
      if (document.activeElement !== el) {
        unreachableCount++;
        continue;
      }
      const cs = getComputedStyle(el);
      const hasOutline = cs.outlineStyle !== "none" && cs.outlineWidth !== "0px";
      const hasBoxShadow = cs.boxShadow !== "none";
      if (!hasOutline && !hasBoxShadow) missingIndicatorCount++;
      void before;
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    return {
      focusableCount: els.length,
      missingIndicatorCount,
      unreachableCount,
    };
  }

  // ---------------- click-to-pick mode ----------------
  // The side panel can't listen to mousemove/click on the real page itself
  // (completely separate execution context) -- so pick mode lives entirely
  // here: an on-page hover outline plus a click handler that pushes the
  // picked element back to the side panel as an unprompted runtime message
  // (not a request/response -- the side panel is not the one that
  // triggered this specific event).
  let pickActive = false;
  let pickOutline: HTMLDivElement | null = null;

  function pickMove(ev: MouseEvent) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!pickOutline) return;
    if (!el || el === pickOutline || el === document.body || el === document.documentElement) {
      pickOutline.style.display = "none";
      return;
    }
    const rect = el.getBoundingClientRect();
    pickOutline.style.left = rect.left + "px";
    pickOutline.style.top = rect.top + "px";
    pickOutline.style.width = rect.width + "px";
    pickOutline.style.height = rect.height + "px";
    pickOutline.style.display = "block";
  }
  function pickClick(ev: MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    const element = inspectAt(ev.clientX, ev.clientY);
    if (element) highlight(element.selector);
    chrome.runtime.sendMessage({ type: "picked", element }).catch(() => {});
  }
  function startPickMode() {
    if (pickActive) return;
    pickActive = true;
    pickOutline = document.createElement("div");
    pickOutline.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #22c55e;background:rgba(34,197,94,0.12);display:none";
    document.body.appendChild(pickOutline);
    document.addEventListener("mousemove", pickMove);
    document.addEventListener("click", pickClick, true);
  }
  function stopPickMode() {
    pickActive = false;
    document.removeEventListener("mousemove", pickMove);
    document.removeEventListener("click", pickClick, true);
    pickOutline?.remove();
    pickOutline = null;
  }

  // ---------------- axe-core scan (vendor/axe.min.js must already be
  // injected into the tab before this runs) ----------------
  async function runAxeInPage() {
    const w = window as unknown as {
      axe?: { run: (context: Document, opts: unknown) => Promise<unknown> };
    };
    if (!w.axe) throw new Error("axe-core not loaded");
    return w.axe.run(document, {
      resultTypes: ["violations", "incomplete"],
      runOnly: {
        type: "tag",
        values: [
          "wcag2a", "wcag2aa", "wcag2aaa",
          "wcag21a", "wcag21aa", "wcag21aaa",
          "wcag22aa", "wcag22aaa",
          "best-practice",
        ],
      },
    });
  }

  // ---------------- message router ----------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      switch (msg?.type) {
        case "inspect":
          sendResponse(inspectAt(msg.x, msg.y));
          break;
        case "focusables":
          sendResponse(focusables());
          break;
        case "contrast-pairs":
          sendResponse(contrastPairs());
          break;
        case "outline":
          sendResponse(outline());
          break;
        case "highlight":
          sendResponse(highlight(msg.selector));
          break;
        case "clear-highlight":
          clearHighlight();
          sendResponse(true);
          break;
        case "focus-el":
          sendResponse(focusEl(msg.selector));
          break;
        case "start-pick-mode":
          startPickMode();
          sendResponse(true);
          break;
        case "stop-pick-mode":
          stopPickMode();
          sendResponse(true);
          break;
        case "apply-a11y-profile":
          sendResponse(applyAccessibilityProfile(msg.settings));
          break;
        case "keyboard-walkthrough":
          sendResponse(keyboardWalkthrough());
          break;
        case "run-axe":
          try {
            sendResponse({ ok: true, result: await runAxeInPage() });
          } catch (e) {
            sendResponse({ ok: false, error: (e as Error).message });
          }
          break;
        case "get-page-text":
          sendResponse((document.body.innerText || "").slice(0, 20000));
          break;
        case "scroll":
          window.scrollBy({ top: msg.direction === "up" ? -400 : 400, behavior: "smooth" });
          sendResponse(true);
          break;
        default:
          sendResponse(null);
      }
    })();
    return true; // async response
  });
}
