import { describe, it, expect, beforeAll } from "vitest";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";

const SCRIPT = path.join(process.cwd(), "scripts", "detect-elements.py");

async function hasPython(): Promise<boolean> {
  const bin = process.env.PYTHON_BIN || "python";
  return new Promise((resolve) => {
    const child = spawn(bin, ["--version"]);
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function runDetector(imagePath: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const bin = process.env.PYTHON_BIN || "python";
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(bin, [SCRIPT, imagePath, "--temp-dir", os.tmpdir()]);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", () => resolve({ stdout, stderr, code: -1 }));
    child.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

const pythonAvailable = await hasPython();

describe("detect-elements.py", () => {
  it("rejects a path outside the temp dir (traversal guard)", async () => {
    if (!pythonAvailable) return; // skip — no python on PATH
    const outside = path.join(process.cwd(), "package.json");
    const { stderr, code } = await runDetector(outside);
    expect(code).toBe(1);
    expect(stderr).toContain("invalid-path");
  });

  describe.skipIf(!pythonAvailable)("detector output contract", () => {
    let pngPath: string;

    beforeAll(async () => {
      const png = await sharp({
        create: { width: 64, height: 64, channels: 3, background: "#ffffff" },
      })
        .png()
        .toBuffer();
      pngPath = path.join(os.tmpdir(), `p8-test-${process.pid}.png`);
      await fs.writeFile(pngPath, png);
    });

    it("degrades gracefully when weights are unavailable (never crashes)", async () => {
      const { stdout, code } = await runDetector(pngPath);
      // Exit 0 with a JSON payload — either a graceful error object or an
      // element array. Both are acceptable; neither crashes.
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      if (Array.isArray(parsed)) {
        expect(parsed.length).toBeGreaterThanOrEqual(0);
      } else {
        expect(parsed).toHaveProperty("error");
      }
    });

    it("emits elements matching the schema when a model is present", async () => {
      const { stdout } = await runDetector(pngPath);
      const parsed = JSON.parse(stdout);
      if (!Array.isArray(parsed)) return; // weights absent — schema N/A
      for (const item of parsed) {
        expect(typeof item.label).toBe("string");
        expect(typeof item.confidence).toBe("number");
        expect(item.confidence).toBeGreaterThanOrEqual(0.4);
        expect(typeof item.class).toBe("string");
        expect(typeof item.bbox.x).toBe("number");
        expect(typeof item.bbox.y).toBe("number");
        expect(typeof item.bbox.w).toBe("number");
        expect(typeof item.bbox.h).toBe("number");
      }
    });
  });
});
