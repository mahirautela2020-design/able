import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CriterionChip } from "@/components/workbench/criterion-chip";
import { getWcagUrl, getWcagLevelBadgeVariant, criterionChipFromId } from "@/lib/wcag";

describe("criterion-chip", () => {
  it("renders correct href for WCAG criterion", () => {
    render(<CriterionChip criterionId="1.4.3" />);

    const link = screen.getByText("1.4.3").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://www.w3.org/WAI/WCAG22/Understanding/143"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders correct href for another criterion", () => {
    render(<CriterionChip criterionId="2.4.7" />);

    const link = screen.getByText("2.4.7").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://www.w3.org/WAI/WCAG22/Understanding/247"
    );
  });
});

describe("getWcagUrl", () => {
  it("generates correct Understanding URL", () => {
    expect(getWcagUrl("1.4.3")).toBe(
      "https://www.w3.org/WAI/WCAG22/Understanding/143"
    );
    expect(getWcagUrl("2.1.1")).toBe(
      "https://www.w3.org/WAI/WCAG22/Understanding/211"
    );
    expect(getWcagUrl("4.1.2")).toBe(
      "https://www.w3.org/WAI/WCAG22/Understanding/412"
    );
  });
});

describe("getWcagLevelBadgeVariant", () => {
  it("returns correct variants for levels", () => {
    expect(getWcagLevelBadgeVariant("A")).toBe("secondary");
    expect(getWcagLevelBadgeVariant("AA")).toBe("default");
    expect(getWcagLevelBadgeVariant("AAA")).toBe("destructive");
    expect(getWcagLevelBadgeVariant("unknown")).toBe("outline");
  });
});

describe("criterionChipFromId", () => {
  it("returns chip data for known criterion", () => {
    const chip = criterionChipFromId("1.4.3");
    expect(chip.id).toBe("1.4.3");
    expect(chip.name).toBe("Contrast (Minimum)");
    expect(chip.level).toBe("AA");
    expect(chip.url).toContain("/Understanding/143");
  });

  it("returns chip data for unknown criterion with no name/level", () => {
    const chip = criterionChipFromId("9.9.9");
    expect(chip.id).toBe("9.9.9");
    expect(chip.name).toBeUndefined();
    expect(chip.level).toBeUndefined();
    expect(chip.url).toContain("/Understanding/999");
  });
});
