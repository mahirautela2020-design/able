import type { Finding } from "@/engine/finding-mapping";
import { runAllChecks, TESTED_SC_IDS } from "./src/inspectors/index";
import type { FigmaNodeLike } from "./src/types";

figma.showUI(__html__, { width: 420, height: 640, themeColors: true });

// Real SceneNodes satisfy FigmaNodeLike structurally (id/name/type/width/
// height/fills/characters/... all exist on the relevant node types) --
// this cast is the same pattern the Chrome extension uses at its
// window-vs-DOM boundary (content-script.ts's `window as unknown as {...}`).
function toNodeLike(node: SceneNode): FigmaNodeLike {
  return node as unknown as FigmaNodeLike;
}

/** Node ids from the most recent audit run, kept so "highlight" and
 * "generate report" (Tasks 8-9) can look a finding's selector (a node id)
 * back up to a real node without re-walking the tree. Cleared and
 * repopulated on every run-audit call -- deliberately NOT persisted across
 * plugin sessions (no history stored, per the project's cross-tool scoping). */
const lastAuditedNodes = new Map<string, SceneNode>();

function getScopeRoots(scope: "selection" | "page"): SceneNode[] {
  if (scope === "selection") return [...figma.currentPage.selection];
  return [...figma.currentPage.children];
}

function indexNodes(roots: SceneNode[]): void {
  lastAuditedNodes.clear();
  const visit = (node: SceneNode) => {
    lastAuditedNodes.set(node.id, node);
    if ("children" in node) {
      for (const child of node.children) visit(child as SceneNode);
    }
  };
  for (const root of roots) visit(root);
}

async function runAudit(scope: "selection" | "page"): Promise<{ findings: Finding[]; testedScIds: string[] }> {
  const roots = getScopeRoots(scope);
  indexNodes(roots);
  const findings = runAllChecks(roots.map(toNodeLike));
  return { findings, testedScIds: TESTED_SC_IDS };
}

interface PluginMessage {
  type: string;
  id: string;
  [key: string]: unknown;
}

async function handle(msg: PluginMessage): Promise<unknown> {
  switch (msg.type) {
    case "get-selection-count":
      return figma.currentPage.selection.length;
    case "run-audit":
      return runAudit(msg.scope as "selection" | "page");
    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

figma.ui.onmessage = async (msg: PluginMessage) => {
  try {
    const result = await handle(msg);
    figma.ui.postMessage({ id: msg.id, ok: true, result });
  } catch (e) {
    figma.ui.postMessage({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
