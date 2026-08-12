import type { Page } from "playwright-core";
import type { Announcement } from "./nvda-types";
import { NvdaDriver } from "./nvda-driver";
import { redactSpokenText } from "./nvda-checks";

export interface NvdaSnapshotOptions {
  driver?: NvdaDriver;
  /** Cap on focusable elements collected (defensive). */
  maxElements?: number;
}

export interface NvdaSnapshotResult {
  available: boolean;
  announcements: Announcement[];
}

/**
 * Capture what NVDA announces for the interactive elements of a page.
 *
 * Strategy (P7 §19-22): enumerate focusable elements in DOM order plus every
 * heading, derive each element's accessible name + role + heading level from
 * the DOM (exactly the data NVDA reads to synthesize speech), and — when a live
 * NVDA driver is present — also drive `nvdaController_speakText` against it in
 * parallel for each element.
 *
 * When NVDA is absent (CI / serverless / non-Windows) this still produces a
 * full announcement log from the accessibility tree and reports
 * `available: false`, so the deterministic checks and the workbench panel keep
 * working everywhere. Password inputs are redacted (RISKS §10).
 */
export async function captureNvdaAnnouncements(
  page: Page,
  options: NvdaSnapshotOptions = {}
): Promise<NvdaSnapshotResult> {
  const driver = options.driver ?? new NvdaDriver(null);
  const maxElements = options.maxElements ?? 100;
  const driverReady = driver.available
    ? await driver.connect().catch(() => false)
    : false;

  const announcements: Announcement[] = [];

  try {
    const collected = await page.evaluate(
      ({ max }) => {
        interface Desc {
          selector: string;
          role: string | null;
          name: string;
          level: number | null;
          isPassword: boolean;
        }

        // Inline describe: DOM-level accessible name/role/level — the same
        // data NVDA announces. Kept inside the evaluate closure so it ships
        // with the serialized callback (no cross-context module refs).
        const describeEl = (el: HTMLElement) => {
          const tag = el.tagName.toLowerCase();
          const isPassword =
            tag === "input" &&
            el.getAttribute("type")?.toLowerCase() === "password";

          let role = el.getAttribute("role");
          let name = el.getAttribute("aria-label") ?? "";

          if (!name) {
            const labelledby = el.getAttribute("aria-labelledby");
            if (labelledby) {
              name = labelledby
                .split(/\s+/)
                .map((id) => {
                  const ref = document.getElementById(id);
                  return ref ? (ref.textContent ?? "").trim() : "";
                })
                .filter(Boolean)
                .join(" ");
            }
          }
          if (!name && tag === "img") name = el.getAttribute("alt") ?? "";
          if (!name && el instanceof HTMLInputElement) {
            // Never read `.value` for a password field: the value is the secret
            // (RISKS §10). Its accessible name comes only from a label, which is
            // not sensitive — the name must be preserved so the field is not
            // falsely reported as silent.
            name = el.getAttribute("placeholder") ?? "";
            if (!name && !isPassword) name = el.value ?? "";
          }
          if (!name && (tag === "a" || tag === "button" || tag === "summary")) {
            name = (el.textContent ?? "").trim();
          }
          if (!name) name = el.getAttribute("title") ?? "";

          if (!role) {
            if (tag === "a") role = "link";
            else if (tag === "button" || tag === "summary") role = "button";
            else if (tag === "input") {
              const type = el.getAttribute("type")?.toLowerCase() || "text";
              role =
                type === "checkbox"
                  ? "checkbox"
                  : type === "radio"
                    ? "radio"
                    : type === "button" || type === "submit" || type === "reset"
                      ? "button"
                      : "textbox";
            } else if (tag === "select") role = "combobox";
            else if (tag === "textarea") role = "textbox";
            else if (/^h[1-6]$/.test(tag)) role = "heading";
            else role = null;
          }

          let level: number | null = null;
          const headingTag = tag.match(/^h([1-6])$/);
          if (headingTag) level = parseInt(headingTag[1], 10);
          else if (role === "heading") {
            const ariaLevel = el.getAttribute("aria-level");
            if (ariaLevel) level = parseInt(ariaLevel, 10) || null;
          }

          return { role, name: name.trim(), level, isPassword };
        };

        const selectorFor = (el: Element) => {
          const e = el as HTMLElement;
          let selector = e.tagName.toLowerCase();
          if (e.id) selector = "#" + e.id;
          else if (typeof e.className === "string") {
            const cls = e.className
              .split(" ")
              .filter((c) => c)
              .slice(0, 2)
              .join(".");
            if (cls) selector = e.tagName.toLowerCase() + "." + cls;
          }
          return selector;
        };

        const focusables: Desc[] = [];
        const seen = new Set<Element>();

        const focusableEls = document.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        for (const raw of focusableEls) {
          if (focusables.length >= max) break;
          const el = raw as HTMLElement;
          if (seen.has(el)) continue;
          seen.add(el);
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (
            rect.width <= 0 ||
            rect.height <= 0 ||
            style.visibility === "hidden" ||
            style.display === "none"
          ) {
            continue;
          }
          focusables.push({ selector: selectorFor(el), ...describeEl(el) });
        }

        const headings: Desc[] = [];
        const headingEls = document.querySelectorAll(
          'h1, h2, h3, h4, h5, h6, [role="heading"]'
        );
        for (const raw of headingEls) {
          const el = raw as HTMLElement;
          if (seen.has(el)) continue;
          seen.add(el);
          headings.push({ selector: selectorFor(el), ...describeEl(el) });
        }

        return { focusables, headings };
      },
      { max: maxElements }
    );

    for (const f of collected.focusables) {
      const spoken = buildSpoken(f.name, f.role, f.level, f.isPassword);
      announcements.push({
        at: Date.now(),
        element: f.selector,
        role: f.role,
        name: f.name,
        level: f.level,
        spoken,
      });
      if (driverReady) {
        await driver.speak(spoken).catch(() => undefined);
      }
    }

    for (const h of collected.headings) {
      const spoken = buildSpoken(h.name, "heading", h.level, false);
      announcements.push({
        at: Date.now(),
        element: h.selector,
        role: "heading",
        name: h.name,
        level: h.level,
        spoken,
      });
      if (driverReady) {
        await driver.speak(spoken).catch(() => undefined);
      }
    }
  } finally {
    driver.disconnect();
  }

  return { available: driverReady, announcements };
}

/** Render the announcement text the way NVDA would. */
function buildSpoken(
  name: string,
  role: string | null,
  level: number | null,
  isPassword: boolean
): string {
  const safeName = isPassword && name ? redactSpokenText(name) : name;

  if (role === "heading") {
    if (level) {
      return safeName
        ? `${safeName}, heading level ${level}`
        : `heading level ${level}`;
    }
    return safeName ? `${safeName}, heading` : "heading";
  }

  if (!role) return safeName;
  return safeName ? `${safeName}, ${role}` : role;
}
