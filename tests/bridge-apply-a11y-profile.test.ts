import { describe, it, expect, beforeEach } from "vitest";
import { ABLE_INSPECT_BRIDGE_SCRIPT } from "@/lib/explore/bridge-script";

interface AbleInspectBridge {
  applyAccessibilityProfile: (settings: {
    filter?: string;
    contrast?: string;
    saturation?: string;
    textScale?: number;
    reducedMotion?: boolean;
    focusMode?: boolean;
    textMagnify?: boolean;
    dictionary?: boolean;
  }) => boolean;
}

declare global {
  interface Window {
    __ableInspect?: AbleInspectBridge;
  }
}

beforeEach(() => {
  eval(ABLE_INSPECT_BRIDGE_SCRIPT);
});

describe("bridge applyAccessibilityProfile (real jsdom execution, not just string presence)", () => {
  it("composes document.body.style.filter from the color settings (saturation → grayscale)", () => {
    window.__ableInspect!.applyAccessibilityProfile({ saturation: "grayscale" });
    expect(document.body.style.filter).toBe("grayscale(1)");
  });

  it("clears the filter when no color settings are given", () => {
    document.body.style.filter = "invert(1)";
    window.__ableInspect!.applyAccessibilityProfile({});
    expect(document.body.style.filter).toBe("");
  });

  it("sets the root font-size percentage from settings.textScale", () => {
    window.__ableInspect!.applyAccessibilityProfile({ textScale: 150 });
    expect(document.documentElement.style.fontSize).toBe("150%");
  });

  it("clears the root font-size when textScale is omitted/falsy", () => {
    document.documentElement.style.fontSize = "150%";
    window.__ableInspect!.applyAccessibilityProfile({});
    expect(document.documentElement.style.fontSize).toBe("");
  });

  it("injects a reduced-motion <style> tag when reducedMotion is true, and only one even if called twice", () => {
    window.__ableInspect!.applyAccessibilityProfile({ reducedMotion: true });
    const styles = document.querySelectorAll("#__able-a11y-style");
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toContain("animation:none");

    window.__ableInspect!.applyAccessibilityProfile({ reducedMotion: true });
    expect(document.querySelectorAll("#__able-a11y-style").length).toBe(1);
  });

  it("removes the reduced-motion <style> tag when reducedMotion is turned back off", () => {
    window.__ableInspect!.applyAccessibilityProfile({ reducedMotion: true });
    expect(document.getElementById("__able-a11y-style")).not.toBeNull();

    window.__ableInspect!.applyAccessibilityProfile({ reducedMotion: false });
    expect(document.getElementById("__able-a11y-style")).toBeNull();
  });

  it("returns true", () => {
    expect(window.__ableInspect!.applyAccessibilityProfile({})).toBe(true);
  });

  it("injects a focus-mode outline rule when focusMode is true", () => {
    window.__ableInspect!.applyAccessibilityProfile({ focusMode: true });
    expect(document.getElementById("__able-a11y-style")!.textContent).toContain("*:focus{outline:4px solid");
  });

  it("injects a text-magnify hover rule when textMagnify is true", () => {
    window.__ableInspect!.applyAccessibilityProfile({ textMagnify: true });
    expect(document.getElementById("__able-a11y-style")!.textContent).toContain("font-size:1.5em");
  });

  it("attaches a dblclick handler when dictionary is enabled, and removes it when disabled", () => {
    window.__ableInspect!.applyAccessibilityProfile({ dictionary: true });
    expect((window as unknown as { __ableDictHandler?: unknown }).__ableDictHandler).not.toBeUndefined();
    expect((window as unknown as { __ableDictHandler?: unknown }).__ableDictHandler).not.toBeNull();

    // jsdom has no caretRangeFromPoint, so dispatching a real dblclick just
    // exercises the handler without crashing (word extraction needs a real
    // layout engine, covered by live browser verification instead).
    expect(() =>
      document.dispatchEvent(new MouseEvent("dblclick", { clientX: 10, clientY: 10 }))
    ).not.toThrow();

    window.__ableInspect!.applyAccessibilityProfile({ dictionary: false });
    expect((window as unknown as { __ableDictHandler?: unknown }).__ableDictHandler).toBeNull();
  });
});
