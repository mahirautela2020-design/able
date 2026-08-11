import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  it("pinned version is consistent (no range operators)", () => {
    const pkgPath = resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const version = pkg.dependencies["axe-core"];
    expect(version).not.toContain("||");
    expect(version).not.toContain(">");
    expect(version).not.toContain("~");
  });
});
