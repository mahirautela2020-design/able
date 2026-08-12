import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseUiAutomatorXml, runDynamicAudit } from "@/lib/android/dynamic";
import {
  checkLabels,
  checkTouchTargets,
  checkContrast,
  pxToDp,
  dpToPx,
  sampleRegionContrast,
} from "@/lib/android/dynamic-checks";
import type { Bounds, Pixels, UiNode } from "@/lib/android/dynamic-checks";

const SCRIPT = resolve(process.cwd(), "scripts/emulator-ctl.sh");
const FIXTURE = resolve(__dirname, "fixtures", "ui-dump.xml");

const fixtureXml = readFileSync(FIXTURE, "utf-8");

function textNode(bounds: Bounds, text = "Hello"): UiNode {
  return {
    className: "android.widget.TextView",
    contentDesc: "",
    text,
    bounds,
    clickable: false,
  };
}

function makeRgbImage(
  width: number,
  height: number,
  bg: [number, number, number],
  rect?: { x: number; y: number; w: number; h: number; fill: [number, number, number] }
): Pixels {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c = bg;
      if (rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) {
        c = rect.fill;
      }
      const i = (y * width + x) * 3;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
    }
  }
  return { width, height, data };
}

describe("parseUiAutomatorXml", () => {
  it("parses all nodes from a uiautomator dump fixture", () => {
    const nodes = parseUiAutomatorXml(fixtureXml);
    expect(nodes.length).toBe(8);
  });

  it("extracts class, content-desc, text, bounds and clickable", () => {
    const nodes = parseUiAutomatorXml(fixtureXml);
    const btn = nodes.find((n) => n.className === "android.widget.Button");
    expect(btn).toBeDefined();
    expect(btn!.clickable).toBe(true);
    expect(btn!.bounds).toEqual([60, 400, 1020, 520]);
  });

  it("decodes XML entities in text/content-desc", () => {
    const xml = `<hierarchy><node text="A &amp; B &lt;tag&gt;" content-desc="&#10;line" class="android.widget.TextView" clickable="false" bounds="[0,0][10,10]"/></hierarchy>`;
    const nodes = parseUiAutomatorXml(xml);
    expect(nodes[0]!.text).toBe("A & B <tag>");
    expect(nodes[0]!.contentDesc).toBe("\nline");
  });

  it("returns [] (never throws) on malformed XML", () => {
    expect(parseUiAutomatorXml("not xml at all")).toEqual([]);
    expect(parseUiAutomatorXml("")).toEqual([]);
    expect(parseUiAutomatorXml("<hierarchy><node text='broken'/></hierarchy>")).toEqual([]);
  });
});

describe("checkLabels (4.1.2)", () => {
  it("flags clickable nodes with empty content-desc AND empty text", () => {
    const nodes = parseUiAutomatorXml(fixtureXml);
    const findings = checkLabels(nodes);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.wcagCriterion).toBe("4.1.2");
    expect(findings[0]!.bucket).toBe("violation");
    expect(findings[0]!.severity).toBe("serious");
  });

  it("does not flag labeled clickable nodes", () => {
    const nodes = parseUiAutomatorXml(fixtureXml);
    const labeled = nodes.filter((n) => n.clickable && (n.contentDesc || n.text));
    expect(labeled.length).toBeGreaterThan(0);
    const findings = checkLabels(labeled);
    expect(findings).toHaveLength(0);
  });
});

describe("checkTouchTargets (2.5.8)", () => {
  it("flags clickable bounds below 24x24dp", () => {
    const nodes = parseUiAutomatorXml(fixtureXml);
    const findings = checkTouchTargets(nodes, 420);
    expect(findings).toHaveLength(2);
    for (const f of findings) {
      expect(f.wcagCriterion).toBe("2.5.8");
      expect(f.bucket).toBe("needs_review");
    }
  });
});

describe("density conversion math", () => {
  it("converts px <-> dp at a given density", () => {
    expect(pxToDp(420, 420)).toBe(160);
    expect(dpToPx(160, 420)).toBe(420);
    expect(pxToDp(24, 480)).toBe(8);
    expect(dpToPx(24, 480)).toBe(72);
  });

  it("treats 63px at 420dpi as exactly 24dp (not below threshold)", () => {
    expect(pxToDp(63, 420)).toBeCloseTo(24, 10);
    const target: UiNode = textNode([0, 0, 63, 63], "x");
    target.clickable = true;
    expect(checkTouchTargets([target], 420)).toHaveLength(0);
  });

  it("flags a 62px target at 420dpi (below 24dp)", () => {
    const target: UiNode = textNode([0, 0, 62, 62], "x");
    target.clickable = true;
    expect(checkTouchTargets([target], 420)).toHaveLength(1);
  });
});

describe("checkContrast (1.4.3)", () => {
  it("samples foreground vs background and flags low contrast", () => {
    const image = makeRgbImage(20, 20, [255, 255, 255], {
      x: 5,
      y: 5,
      w: 10,
      h: 10,
      fill: [153, 153, 153], // #999999 on white ~ 2.85:1
    });
    const nodes = [textNode([5, 5, 15, 15])];
    const findings = checkContrast(nodes, image);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.wcagCriterion).toBe("1.4.3");
    expect(findings[0]!.severity).toBe("serious");
    expect(findings[0]!.bucket).toBe("needs_review");
  });

  it("does not flag passing contrast", () => {
    const image = makeRgbImage(20, 20, [255, 255, 255], {
      x: 5,
      y: 5,
      w: 10,
      h: 10,
      fill: [51, 51, 51], // #333333 on white ~ 12.6:1
    });
    expect(checkContrast([textNode([5, 5, 15, 15])], image)).toHaveLength(0);
  });

  it("returns [] when no screenshot pixels are available", () => {
    expect(checkContrast([textNode([5, 5, 15, 15])], null)).toHaveLength(0);
  });

  it("sampleRegionContrast returns null on empty input", () => {
    const empty: Pixels = { width: 0, height: 0, data: new Uint8Array(0) };
    expect(sampleRegionContrast(empty, [0, 0, 10, 10])).toBeNull();
  });
});

describe("no LLM in the dynamic path", () => {
  it("every dynamic finding is source 'dynamic' (templated, measured)", () => {
    const nodes = parseUiAutomatorXml(fixtureXml);
    const all = [...checkLabels(nodes), ...checkTouchTargets(nodes, 420)];
    expect(all.length).toBeGreaterThan(0);
    for (const f of all) {
      expect(f.sourceEngines).toContain("dynamic");
    }
  });
});

describe("runDynamicAudit degrade path", () => {
  it("returns { ran:false } when no emulator is configured (static-only)", async () => {
    const prevAvd = process.env.AVD_NAME;
    const prevForce = process.env.APK_DYNAMIC;
    delete process.env.AVD_NAME;
    delete process.env.APK_DYNAMIC;
    try {
      const result = await runDynamicAudit("/nonexistent/app.apk");
      expect(result.ran).toBe(false);
      expect(Array.isArray(result.screens)).toBe(true);
      expect(result.screens).toHaveLength(0);
    } finally {
      if (prevAvd !== undefined) process.env.AVD_NAME = prevAvd;
      if (prevForce !== undefined) process.env.APK_DYNAMIC = prevForce;
    }
  });
});

describe("emulator-ctl.sh", () => {
  it("documents its subcommands", () => {
    const src = readFileSync(SCRIPT, "utf-8");
    for (const cmd of ["present", "boot", "install", "launch", "snapshot", "dump", "density", "shutdown"]) {
      expect(src).toContain(cmd);
    }
  });

  const sh = (() => {
    for (const candidate of ["bash", "sh"]) {
      try {
        execFileSync(candidate, ["--version"], { stdio: "ignore", timeout: 3000 });
        return candidate;
      } catch {
        // try next
      }
    }
    return null;
  })();

  it.skipIf(!sh)("--help lists subcommands", () => {
    const out = execFileSync(sh!, [SCRIPT, "--help"], { encoding: "utf-8", timeout: 5000 });
    expect(out).toContain("boot");
    expect(out).toContain("dump");
    expect(out).toContain("shutdown");
  });
});

// Integration test — only runs when ANDROID_EMULATOR=1 and a real AVD exists.
const hasEmulator = process.env.ANDROID_EMULATOR === "1";
describe.skipIf(!hasEmulator)(
  "emulator integration (live AVD)",
  () => {
    it("runs a dynamic audit against a live emulator", async () => {
      const apkPath = process.env.ANDROID_TEST_APK || resolve(__dirname, "fixtures", "sample-appk.apk");
      const result = await runDynamicAudit(apkPath, { force: true, package: "com.example.a11ytest" });
      expect(result.ran).toBe(true);
      expect(result.screens.length).toBeGreaterThan(0);
    });
  },
  300_000
);
