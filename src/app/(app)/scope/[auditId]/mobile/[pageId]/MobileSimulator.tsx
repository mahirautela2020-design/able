"use client";

import { useState, useEffect } from "react";
import { buildAccessibilityTree } from "@/lib/android/accessibility-tree";
import type { AndroidAccessibilityTree } from "@/lib/android/accessibility-tree";

interface MobileSimulatorProps {
  auditId: string;
  pageId: string;
}

export function MobileSimulator({ auditId, pageId }: MobileSimulatorProps) {
  const [tree, setTree] = useState<AndroidAccessibilityTree | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTree() {
      try {
        const res = await fetch(`/api/audits/${auditId}`);
        if (!res.ok) {
          const fallbackTree = buildAccessibilityTree("com.example.app", "MainActivity", {
            activities: ["com.example.app.HomeActivity", "com.example.app.SettingsActivity"],
            permissions: ["android.permission.INTERNET"],
          });
          setTree(fallbackTree);
          return;
        }

        const data = await res.json();
        const manifestJson = data.config?.manifestJson || data.manifest_json || {};
        const treeData = buildAccessibilityTree(
          manifestJson.package || "com.example.app",
          "MainActivity",
          manifestJson
        );
        setTree(treeData);
      } catch {
        const fallbackTree = buildAccessibilityTree("com.example.app", "MainActivity", {
          activities: [],
          permissions: [],
        });
        setTree(fallbackTree);
      } finally {
        setLoading(false);
      }
    }

    loadTree();
  }, [auditId, pageId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 border rounded-lg">
        <p className="text-muted-foreground">Loading mobile view...</p>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="flex items-center justify-center h-64 border rounded-lg">
        <p className="text-muted-foreground">No accessibility tree available</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <div className="w-80 h-[640px] border rounded-lg bg-black relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-gray-800 to-gray-900 p-2 text-white text-xs">
          {tree.packageName}
        </div>
        <div className="pt-8 p-4 text-white text-sm font-mono">
          <div
            role="tree"
            aria-label={`Accessibility tree for ${tree.packageName}`}
            className="space-y-1"
          >
            <TreeNode node={tree.root} depth={0} />
          </div>
        </div>
      </div>

      <div className="flex-1">
        <h2 className="text-lg font-semibold mb-2">Accessibility Properties</h2>
        <div className="border rounded-lg p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Package:</span>
            <span>{tree.packageName}</span>
            <span className="text-muted-foreground">Activity:</span>
            <span>{tree.activityName}</span>
            <span className="text-muted-foreground">TalkBack Labels:</span>
            <span className="text-green-600">
              {countLabels(tree.root)} elements labeled
            </span>
          </div>
          <div className="mt-4">
            <h3 className="font-medium mb-2">TalkBack Announcements</h3>
            <div className="space-y-1 text-sm">
              {tree.root.children.map((child, i) => (
                <div key={i} className="border-l-2 border-blue-400 pl-2">
                  <span className="font-mono text-blue-600">{child.className.split(".").pop()}</span>
                  <span className="text-muted-foreground ml-2">
                    &quot;{child.contentDescription}&quot;
                  </span>
                  {child.actions.map((action) => (
                    <span key={action} className="ml-1 text-xs bg-muted px-1 rounded">
                      {action}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TreeNode({ node, depth }: { node: { id: string; className: string; text: string; contentDescription: string; isClickable: boolean; isFocusable: boolean; children: typeof node[] }; depth: number }) {
  return (
    <div role="treeitem" aria-expanded={node.children.length > 0} aria-selected={false}>
      <div className="flex items-center gap-1" style={{ paddingLeft: depth * 16 }}>
        <span className="text-gray-400">
          {node.isClickable ? "[▢]" : "[—]"}
        </span>
        <span className={node.isFocusable ? "text-green-400" : "text-gray-500"}>
          {node.className.split(".").pop()}
        </span>
        {node.contentDescription && (
          <span className="text-yellow-400 text-xs">
            cd=&quot;{node.contentDescription}&quot;
          </span>
        )}
        {node.text && !node.contentDescription && (
          <span className="text-gray-300 text-xs">
            &quot;{node.text}&quot;
          </span>
        )}
      </div>
      {node.children.map((child, i) => (
        <TreeNode key={`${child.id}-${i}`} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function countLabels(node: { contentDescription: string; children: typeof node[] }): number {
  let count = node.contentDescription ? 1 : 0;
  for (const child of node.children) {
    count += countLabels(child);
  }
  return count;
}
