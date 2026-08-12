"use client";

import type { AxNode } from "@/lib/axe/types";
import { cn } from "@/lib/utils";

interface AxTreeProps {
  root: AxNode;
  className?: string;
}

export function AxTree({ root, className }: AxTreeProps) {
  return (
    <div className={cn("font-mono text-sm", className)}>
      <AxNodeView node={root} depth={0} />
    </div>
  );
}

function AxNodeView({ node, depth }: { node: AxNode; depth: number }) {
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-accent/50 transition-colors",
          depth === 1 && "ml-4",
          depth === 2 && "ml-8",
          depth === 3 && "ml-12",
          depth >= 4 && "ml-16"
        )}
      >
        <span className="text-muted-foreground shrink-0 text-xs w-20">
          {node.role}
          {node.level ? ` (h${node.level})` : ""}
        </span>
        {node.name && (
          <span className="truncate text-xs">
            &ldquo;{node.name}&rdquo;
          </span>
        )}
        {node.properties && Object.keys(node.properties).length > 0 && (
          <span className="text-xs text-muted-foreground">
            {JSON.stringify(node.properties)}
          </span>
        )}
      </div>
      {hasChildren &&
        node.children.map((child, i) => (
          <AxNodeView key={`${child.role}-${child.name}-${i}`} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}
