"use client";

import type { AxNode } from "@/lib/axe/types";
import { cn } from "@/lib/utils";

interface AxTreeProps {
  root: AxNode;
  className?: string;
  onNodeClick?: (role: string, name: string) => void;
}

export function AxTree({ root, className, onNodeClick }: AxTreeProps) {
  return (
    <div className={cn("font-mono text-sm", className)}>
      <AxNodeView node={root} depth={0} onNodeClick={onNodeClick} />
    </div>
  );
}

function AxNodeView({
  node,
  depth,
  onNodeClick,
}: {
  node: AxNode;
  depth: number;
  onNodeClick?: (role: string, name: string) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const clickable = !!onNodeClick;

  return (
    <div>
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onNodeClick?.(node.role, node.name) : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onNodeClick?.(node.role, node.name);
                }
              }
            : undefined
        }
        className={cn(
          "flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-accent/50 transition-colors",
          clickable && "cursor-pointer",
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
          <AxNodeView
            key={`${child.role}-${child.name}-${i}`}
            node={child}
            depth={depth + 1}
            onNodeClick={onNodeClick}
          />
        ))}
    </div>
  );
}
