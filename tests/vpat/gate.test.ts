import { describe, it, expect } from "vitest";
import { buildVPAT } from "@/lib/vpat/builder";
import type { Finding } from "@/engine/axe-scan";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));

describe("vpat gate", () => {
  it("passes ACR/VPAT export fixture test", () => {
    const fixturePath = path.join(dir, "fixtures", "sample-findings.json");
    const findings = JSON.parse(
      readFileSync(fixturePath, "utf-8")
    ) as Finding[];

    const vpat = buildVPAT({ findings, maturity: null });

    // 1.1.1 should be Does Not Support (serious finding)
    const sc111 = vpat.sections.find((s) => s.criteria.startsWith("1.1.1"));
    expect(sc111).toBeDefined();
    expect(sc111?.conformance).toBe("Does Not Support");

    // 1.4.3 should be Does Not Support (critical finding)
    const sc143 = vpat.sections.find((s) => s.criteria.startsWith("1.4.3"));
    expect(sc143?.conformance).toBe("Does Not Support");

    // 4.1.2 should be Does Not Support (critical finding)
    const sc412 = vpat.sections.find((s) => s.criteria.startsWith("4.1.2"));
    expect(sc412?.conformance).toBe("Does Not Support");

    // 1.3.1 should be Partial (moderate finding)
    const sc131 = vpat.sections.find((s) => s.criteria.startsWith("1.3.1"));
    expect(sc131).toBeDefined();
    if (sc131) {
      expect(sc131.conformance).toBe("Partial");
    }

    // Verify sections count: 38 WCAG + no maturity (null maturity passed)
    expect(vpat.sections.length).toBeGreaterThanOrEqual(38);

    // Verify remarks exist for everything
    for (const section of vpat.sections) {
      if (section.criteria.startsWith("Maturity")) continue;
      expect(typeof section.remarks).toBe("string");
      expect(section.remarks.length).toBeGreaterThan(0);
    }
  });
});
