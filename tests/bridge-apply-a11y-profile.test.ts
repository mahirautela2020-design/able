import { describe, it, expect, beforeEach } from "vitest";
import { ABLE_INSPECT_BRIDGE_SCRIPT } from "@/lib/explore/bridge-script";

interface AbleInspectBridge {
  applyAccessibilityProfile: (settings: {
    filter?: string;
    contrast?: string;
    saturation?: string;
    textScale?: number;
    reducedMotion?: boolean;
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
});
