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

/** Minimal shape of a Playwright CDPSession — narrowed so this module and
 * its tests don't depend on playwright-core's internal CDP session type. */
export interface CdpSessionLike {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

interface DescribeNodeResult {
  node?: { localName?: string };
}

interface BoxModelResult {
  model?: { content?: number[]; width?: number; height?: number };
}

const AX_TREE_TIMEOUT = 15_000;
const PER_NODE_ENRICH_TIMEOUT = 2_000;

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

    return await flattenNodes(nodes, session);
  } finally {
    await session.detach().catch(() => {});
  }
}

/** Race a per-node CDP lookup against a short deadline so one slow/unresolvable
 * backendNodeId can't stall the whole page's capture. */
async function withNodeTimeout<T>(promise: Promise<T>): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), PER_NODE_ENRICH_TIMEOUT)
    ),
  ]);
}

/** Resolve the real DOM tag name + layout rect for one AX node via CDP,
 * using the backendDOMNodeId the accessibility tree already carries.
 * Best-effort: any failure (detached node, pseudo-element, etc.) just
 * leaves rect/domTag null rather than failing the whole capture. */
async function enrichNode(
  session: CdpSessionLike,
  backendNodeId: number
): Promise<{ rect: AxFlatNode["rect"]; domTag: string | null }> {
  let domTag: string | null = null;
  let rect: AxFlatNode["rect"] = null;

  try {
    const described = await withNodeTimeout(
      session.send("DOM.describeNode", { backendNodeId }) as Promise<DescribeNodeResult>
    );
    const localName = described?.node?.localName;
    if (localName) domTag = localName.toLowerCase();
  } catch {
    // best-effort
  }

  try {
    const boxed = await withNodeTimeout(
      session.send("DOM.getBoxModel", { backendNodeId }) as Promise<BoxModelResult>
    );
    const model = boxed?.model;
    if (
      model?.content &&
      model.content.length >= 2 &&
      typeof model.width === "number" &&
      typeof model.height === "number"
    ) {
      rect = {
        x: model.content[0],
        y: model.content[1],
        width: model.width,
        height: model.height,
      };
    }
  } catch {
    // best-effort
  }

  return { rect, domTag };
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

async function flattenNodes(
  cdpNodes: CdpAxNode[],
  session: CdpSessionLike
): Promise<AxFlatNode[]> {
  const flat: AxFlatNode[] = [];
  const backendNodeIds: (number | undefined)[] = [];

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
      rect: null,
      focusable,
      domTag: null,
    });
    backendNodeIds.push(node.backendDOMNodeId);
  }

  // Enrich rect/domTag via CDP for nodes actually worth checking — bound
  // the round-trip cost by skipping invisible/nameless/non-focusable nodes,
  // which the downstream checks (role-mismatch, reading-order, duplicate
  // names) never look at anyway.
  const enrichTasks: Promise<void>[] = [];
  for (let i = 0; i < flat.length; i++) {
    const n = flat[i];
    const backendNodeId = backendNodeIds[i];
    if (backendNodeId == null || !n.isVisible || !(n.name || n.focusable)) continue;

    enrichTasks.push(
      enrichNode(session, backendNodeId).then(({ rect, domTag }) => {
        n.rect = rect;
        n.domTag = domTag;
      })
    );
  }
  await Promise.all(enrichTasks);

  return flat;
}
