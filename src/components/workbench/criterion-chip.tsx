"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getWcagUrl, getWcagLevelBadgeVariant } from "@/lib/wcag";
import { getScById } from "@/engine/wcag-registry";

interface CriterionChipProps {
  criterionId: string;
  className?: string;
}

export function CriterionChip({ criterionId, className }: CriterionChipProps) {
  const sc = getScById(criterionId);
  const url = getWcagUrl(criterionId);
  const variant = sc ? getWcagLevelBadgeVariant(sc.level) : "outline";

  return (
    <Link href={url} target="_blank" rel="noopener noreferrer" className={cn("inline-flex", className)}>
      <Badge
        variant={variant}
        className="cursor-pointer hover:opacity-80 transition-opacity font-mono"
        title={sc ? `${sc.name} (Level ${sc.level})` : criterionId}
      >
        {criterionId}
      </Badge>
    </Link>
  );
}
