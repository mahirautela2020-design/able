import type { Page } from "playwright-core";

// Accessibility-tree snapshot capture. Playwright 1.62 removed
// `page.accessibility.snapshot()`, so we read the real AX tree via CDP
// (`Accessibility.getFullAXTree`) and normalize it into a simple role/name tree.

export interface AriaNode {
  role: string;
  name: string;
  level?: number;
  children: AriaNode[];
}

interface AxValue {
  type?: string;
  value?: unknown;
}

interface AxTreeNode {
  nodeId: string;
  ignored?: boolean;
  parentId?: string;
  role?: AxValue;
  name?: AxValue;
  properties?: Array<{ name: string; value?: AxValue }>;
  childIds?: string[];
}

export async function captureAriaSnapshot(
  page: Page
): Promise<AriaNode | null> {
  try {
    const session = await page.context().newCDPSession(page);
    const result = (await session.send("Accessibility.getFullAXTree")) as {
      nodes?: AxTreeNode[];
    };
    const nodes = result.nodes ?? [];
    if (nodes.length === 0) return null;

    const byId = new Map<string, AxTreeNode>();
    for (const n of nodes) byId.set(n.nodeId, n);

    // Build the tree from a node. Chromium marks presentational containers as
    // `ignored`; those nodes are dropped but their children are promoted, so
    // real controls (buttons, inputs) are never lost behind an ignored wrapper.
    const build = (node: AxTreeNode): AriaNode[] => {
      const children: AriaNode[] = [];
      for (const cid of node.childIds ?? []) {
        const child = byId.get(cid);
        if (!child) continue;
        children.push(...build(child));
      }

      if (node.ignored) {
        return children;
      }

      const role =
        node.role?.value != null ? String(node.role.value) : "generic";
      const name = node.name?.value != null ? String(node.name.value) : "";

      let level: number | undefined;
      if (node.properties) {
        const lvl = node.properties.find((p) => p.name === "level");
        if (
          lvl?.value?.type === "integer" &&
          typeof lvl.value.value === "number"
        ) {
          level = lvl.value.value;
        }
      }

      return [
        {
          role,
          name,
          ...(level != null ? { level } : {}),
          children,
        },
      ];
    };

    // Roots are nodes whose parent is not part of the returned tree.
    const roots = nodes.filter((n) => !n.parentId || !byId.has(n.parentId));
    const root = roots.find((n) => !n.ignored) ?? roots[0];
    if (!root) return null;
    const built = build(root);
    return built.length > 0 ? built[0] : null;
  } catch {
    return null;
  }
}
