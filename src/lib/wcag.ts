import { getScById } from "@/engine/wcag-registry";

const WCAG_UNDERSTANDING_BASE = "https://www.w3.org/WAI/WCAG22/Understanding";

export function getWcagUrl(criterionId: string): string {
  return `${WCAG_UNDERSTANDING_BASE}/${criterionId.replace(/\./g, "")}`;
}

export function getWcagLevelBadgeVariant(level: string): "default" | "secondary" | "destructive" | "outline" {
  switch (level) {
    case "A": return "secondary";
    case "AA": return "default";
    case "AAA": return "destructive";
    default: return "outline";
  }
}

export interface CriterionChipData {
  id: string;
  name?: string;
  level?: string;
  url: string;
}

export function criterionChipFromId(criterionId: string): CriterionChipData {
  const sc = getScById(criterionId);
  return {
    id: criterionId,
    name: sc?.name,
    level: sc?.level,
    url: getWcagUrl(criterionId),
  };
}
