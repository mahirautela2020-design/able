import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getPinnedAxeVersion,
  resolvedAxeMatchesPin,
} from "@/lib/code/lint-runner";

describe("axe-version-parity", () => {
  it("package.json has axe-core listed", () => {
    const pkgPath = resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.dependencies["axe-core"]).toBeDefined();
  });

  it("axe version is 4.13.x", () => {
    const pkgPath = resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const version = pkg.dependencies["axe-core"];
    expect(version).toMatch(/4\.13/);
  });

  it("pinned version is strictly pinned (no range operators)", () => {
    const pkgPath = resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const version = pkg.dependencies["axe-core"];
    expect(version).not.toContain("||");
    expect(version).not.toContain(">");
    expect(version).not.toContain("~");
    expect(version).not.toContain("^");
  });

  it("getPinnedAxeVersion returns the package.json pin", () => {
    const pkgPath = resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(getPinnedAxeVersion()).toBe(pkg.dependencies["axe-core"]);
  });

  it("resolved module version satisfies the pin (no drift)", async () => {
    const axe = (await import("axe-core")).default as { version?: string };
    expect(axe.version).toBeDefined();
    expect(resolvedAxeMatchesPin(getPinnedAxeVersion(), axe.version!)).toBe(true);
  });

  it("resolvedAxeMatchesPin rejects downgrade and major/minor drift", () => {
    expect(resolvedAxeMatchesPin("4.13.0", "4.13.0")).toBe(true);
    expect(resolvedAxeMatchesPin("4.13.0", "4.12.0")).toBe(false);
    expect(resolvedAxeMatchesPin("4.13.0", "5.0.0")).toBe(false);
    expect(resolvedAxeMatchesPin("4.13.0", "4.14.0")).toBe(false);
  });

  it("resolvedAxeMatchesPin honors caret/tilde floors", () => {
    expect(resolvedAxeMatchesPin("^4.13.0", "4.13.0")).toBe(true);
    expect(resolvedAxeMatchesPin("^4.13.0", "4.14.2")).toBe(true);
    expect(resolvedAxeMatchesPin("^4.13.0", "5.0.0")).toBe(false);
    expect(resolvedAxeMatchesPin("~4.13.0", "4.13.5")).toBe(true);
    expect(resolvedAxeMatchesPin("~4.13.0", "4.14.0")).toBe(false);
  });
});
