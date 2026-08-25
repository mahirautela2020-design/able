import type { Finding } from "@/engine/finding-mapping";
import { checkTextContrast } from "./contrast";
import { checkTouchTargetSize } from "./touch-target";
import { checkFixedResizeText, checkHeadingStructure, checkMissingDescriptions } from "./content-structure";
import type { FigmaNodeLike } from "../types";

/** Every WCAG SC id a live Figma-plugin inspector actually covers. Passed
 * as computeComplianceMatrix's testedScIds so every SC outside this set
 * reports "manual" instead of a fabricated pass -- see
 * docs/superpowers/specs/2026-08-24-figma-plugin-design.md's Checks section. */
export const TESTED_SC_IDS = ["1.4.3", "2.5.8", "1.1.1", "1.4.4", "2.4.6"];

export function runAllChecks(roots: FigmaNodeLike[]): Finding[] {
  return [
    ...checkTextContrast(roots),
    ...checkTouchTargetSize(roots),
    ...checkMissingDescriptions(roots),
    ...checkFixedResizeText(roots),
    ...checkHeadingStructure(roots),
  ];
}
