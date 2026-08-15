import { describe, it, expect, beforeEach, vi } from "vitest";
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

  it("attaches a hover spotlight handler when focusMode is enabled, and removes it (and its overlay) when disabled", () => {
    window.__ableInspect!.applyAccessibilityProfile({ focusMode: true });
    expect((window as unknown as { __ableFocusModeHandler?: unknown }).__ableFocusModeHandler).not.toBeUndefined();
    expect((window as unknown as { __ableFocusModeHandler?: unknown }).__ableFocusModeHandler).not.toBeNull();
    expect(document.getElementById("__able-focus-spot")).not.toBeNull();

    // Hovering a content section should not throw, even without real layout.
    const p = document.createElement("p");
    p.textContent = "hello";
    document.body.appendChild(p);
    expect(() =>
      p.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    ).not.toThrow();

    window.__ableInspect!.applyAccessibilityProfile({ focusMode: false });
    expect((window as unknown as { __ableFocusModeHandler?: unknown }).__ableFocusModeHandler).toBeNull();
    expect(document.getElementById("__able-focus-spot")).toBeNull();
  });

  it("does not attach a second focus-mode handler when applied twice", () => {
    window.__ableInspect!.applyAccessibilityProfile({ focusMode: true });
    const first = (window as unknown as { __ableFocusModeHandler?: unknown }).__ableFocusModeHandler;
    window.__ableInspect!.applyAccessibilityProfile({ focusMode: true });
    const second = (window as unknown as { __ableFocusModeHandler?: unknown }).__ableFocusModeHandler;
    expect(second).toBe(first);
    expect(document.querySelectorAll("#__able-focus-spot").length).toBe(1);
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

  it("renders a pronunciation-audio button when the dictionary API returns an audio URL, and playing it does not bubble to close the popup", async () => {
    const textNode = document.createTextNode("hello world");
    const p = document.createElement("p");
    p.appendChild(textNode);
    document.body.appendChild(p);

    document.caretRangeFromPoint = vi.fn(() => {
      const range = document.createRange();
      range.setStart(textNode, 1);
      range.collapse(true);
      return range;
    }) as unknown as typeof document.caretRangeFromPoint;

    const audioPlay = vi.fn();
    (window as unknown as { Audio: unknown }).Audio = vi.fn(function AudioStub() {
      return { play: audioPlay };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            word: "hello",
            phonetic: "/həˈloʊ/",
            phonetics: [
              { text: "/həˈloʊ/", audio: "" },
              { text: "", audio: "https://example.com/hello.mp3" },
            ],
            meanings: [
              { partOfSpeech: "exclamation", definitions: [{ definition: "used as a greeting" }] },
            ],
          },
        ],
      })
    );

    window.__ableInspect!.applyAccessibilityProfile({ dictionary: true });
    document.dispatchEvent(new MouseEvent("dblclick", { clientX: 5, clientY: 5, bubbles: true }));

    await vi.waitFor(() => {
      expect(document.querySelector(".__able-dict-audio")).not.toBeNull();
    });

    const audioBtn = document.querySelector(".__able-dict-audio") as HTMLButtonElement;
    expect(() => audioBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))).not.toThrow();
    expect(audioPlay).toHaveBeenCalled();
    // The popup should still be present — the audio button's click didn't
    // bubble up to the document-level "close popup on click" handler.
    expect(document.querySelector(".__able-dict-popup")).not.toBeNull();

    vi.unstubAllGlobals();
    delete (window as unknown as { Audio?: unknown }).Audio;
    document.caretRangeFromPoint = undefined as unknown as typeof document.caretRangeFromPoint;
    window.__ableInspect!.applyAccessibilityProfile({ dictionary: false });
  });
});
