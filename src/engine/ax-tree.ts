/**
 * P11 — AX-tree capture via CDP (Accessibility.getFullAXTree).
 *
 * Captures the browser accessibility tree and normalizes it into a flat list
 * of nodes with role, name, description, level, value, checked, disabled,
 * expanded, focusable, and bounding rect.
 */
import type { Page } from "playwright-core";

export interface AxFlatNode {
  role: string;
  name: string;
  description: string;
  level: number | null;
  value: string | null;
  checked: boolean | null;
  disabled: boolean;
  expanded: boolean | null;
  isVisible: boolean;
  rect: { x: number; y: number; width: number; height: number } | null;
  focusable: boolean;
  /** DOM tag derived from the node, if available. */
  domTag: string | null;
}

interface CdpAxValue {
  type?: string;
  value?: unknown;
}

interface CdpAxProperty {
  name: string;
  value?: CdpAxValue;
}

interface CdpAxNode {
  nodeId: string;
  ignored?: boolean;
  parentId?: string;
  role?: CdpAxValue;
  name?: CdpAxValue;
  description?: CdpAxValue;
  value?: CdpAxValue;
  properties?: CdpAxProperty[];
  childIds?: string[];
  backendDOMNodeId?: number;
}

const AX_TREE_TIMEOUT = 15_000;

/**
 * Capture the full AX tree from a page and normalize to a flat node list.
 * Guarded with try/catch + 15s timeout per spec.
 */
export async function captureAxTree(page: Page): Promise<AxFlatNode[]> {
  try {
    const result = await Promise.race([
      captureRaw(page),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AX_TREE_TIMEOUT")), AX_TREE_TIMEOUT)
      ),
    ]);
    return result;
  } catch {
    return [];
  }
}

async function captureRaw(page: Page): Promise<AxFlatNode[]> {
  const session = await page.context().newCDPSession(page);
  try {
    const tree = (await session.send("Accessibility.getFullAXTree")) as {
      nodes?: CdpAxNode[];
    };
    const nodes = tree.nodes ?? [];
    if (nodes.length === 0) return [];

    return flattenNodes(nodes);
  } finally {
    await session.detach().catch(() => {});
  }
}

function str(v: CdpAxValue | undefined): string {
  if (!v || v.value == null) return "";
  return String(v.value);
}

function prop(node: CdpAxNode, name: string): CdpAxValue | undefined {
  return node.properties?.find((p) => p.name === name)?.value;
}

function boolProp(node: CdpAxNode, name: string): boolean | null {
  const v = prop(node, name);
  if (!v || v.value == null) return null;
  if (v.type === "tristate" && v.value === "mixed") return true;
  return v.value === true || v.value === "true";
}

function flattenNodes(cdpNodes: CdpAxNode[]): AxFlatNode[] {
  const flat: AxFlatNode[] = [];

  for (const node of cdpNodes) {
    if (node.ignored) continue;

    const role = str(node.role) || "generic";
    if (role === "none" || role === "presentation") continue;

    const name = str(node.name);
    const description = str(node.description);
    const value = str(node.value) || null;

    let level: number | null = null;
    const lvlProp = prop(node, "level");
    if (lvlProp?.value != null && typeof lvlProp.value === "number") {
      level = lvlProp.value;
    }

    const checked = boolProp(node, "checked");
    const disabled = boolProp(node, "disabled") === true;
    const expanded = boolProp(node, "expanded");
    const focusable = boolProp(node, "focusable") === true;

    // Visibility: hidden nodes are marked via properties
    const hidden = boolProp(node, "hidden");
    const isVisible = hidden !== true;

    flat.push({
      role,
      name,
      description,
      level,
      value,
      checked,
      disabled,
      expanded,
      isVisible,
      rect: null, // CDP AX tree doesn't include layout; could be enriched later
      focusable,
      domTag: null,
    });
  }

  return flat;
}
