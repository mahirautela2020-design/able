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

function highlightNode(nodeId: string): boolean {
  const node = lastAuditedNodes.get(nodeId);
  if (!node) return false;
  try {
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
    return true;
  } catch {
    // lastAuditedNodes holds live SceneNode references captured at audit
    // time. If the node was deleted (or otherwise removed) after indexing
    // but before this call, the map still "has" it, so the !node guard
    // above passes — but mutating selection/viewport with a stale
    // reference throws a native Figma platform error (e.g. "the node has
    // been removed"). From the user's perspective "never audited" and
    // "audited but since deleted" are the same situation: this element
    // isn't there anymore. Collapse both to the same `false` result
    // instead of letting an opaque platform error bubble up.
    return false;
  }
}

const REPORT_PAGE_NAME = "ScanA11y Report";
const REPORT_MARKER_KEY = "scana11yGenerated";
const PAGE_WIDTH = 1280;
const PAGE_HEIGHT = 720;
const PAGE_GAP = 40;
// Matches the UI's planned findings-list display cap (Task 11) so report
// generation and the on-screen list stay consistent.
const MAX_REPORT_FINDINGS = 40;

async function createReportText(
  characters: string,
  opts: { fontSize: number; bold?: boolean; x: number; y: number; width?: number }
): Promise<TextNode> {
  const style = opts.bold ? "Bold" : "Regular";
  await figma.loadFontAsync({ family: "Inter", style });
  const text = figma.createText();
  text.fontName = { family: "Inter", style };
  text.characters = characters;
  text.fontSize = opts.fontSize;
  text.x = opts.x;
  text.y = opts.y;
  if (opts.width) {
    text.textAutoResize = "HEIGHT";
    text.resize(opts.width, text.height);
  }
  return text;
}

async function buildFindingFrame(finding: Finding, y: number): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = finding.rule_title;
  frame.resize(PAGE_WIDTH, PAGE_HEIGHT);
  frame.x = 0;
  frame.y = y;
  frame.setPluginData(REPORT_MARKER_KEY, "1");

  const heading = await createReportText(finding.rule_title, { fontSize: 24, bold: true, x: 48, y: 48, width: 1184 });
  frame.appendChild(heading);

  const meta = await createReportText(
    `${finding.severity.toUpperCase()} · WCAG ${finding.wcag_criteria.join(", ")} (${finding.wcag_level ?? "—"})`,
    { fontSize: 14, x: 48, y: 90 }
  );
  frame.appendChild(meta);

  const node = lastAuditedNodes.get(finding.selector);
  if (node && "exportAsync" in node) {
    try {
      const bytes = await (node as ExportMixin).exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
      const image = figma.createImage(bytes);
      const shot = figma.createRectangle();
      shot.name = "Evidence screenshot";
      shot.resize(600, 400);
      shot.x = 48;
      shot.y = 140;
      shot.fills = [{ type: "IMAGE", scaleMode: "FIT", imageHash: image.hash }];
      frame.appendChild(shot);
    } catch {
      // Node may have been deleted/moved since the audit ran -- fall back
      // to a text-only frame rather than failing the whole report.
    }
  }

  const rec = await createReportText(finding.failure_summary, { fontSize: 14, x: 700, y: 140, width: 532 });
  frame.appendChild(rec);

  return frame;
}

async function generateReport(findings: Finding[]): Promise<{ ok: boolean }> {
  let page = figma.root.children.find(
    (p): p is PageNode => p.type === "PAGE" && p.name === REPORT_PAGE_NAME
  );
  if (!page) {
    page = figma.createPage();
    page.name = REPORT_PAGE_NAME;
  } else {
    // Replace only ScanA11y-generated frames from a previous run, so
    // re-running doesn't grow the page unbounded and doesn't touch
    // anything a user might have manually added to this page.
    for (const child of [...page.children]) {
      if (child.getPluginData(REPORT_MARKER_KEY) === "1") child.remove();
    }
  }

  let y = 0;
  const cover = figma.createFrame();
  cover.name = "Cover";
  cover.resize(PAGE_WIDTH, PAGE_HEIGHT);
  cover.x = 0;
  cover.y = y;
  cover.setPluginData(REPORT_MARKER_KEY, "1");
  const title = await createReportText("ScanA11y accessibility report", { fontSize: 32, bold: true, x: 48, y: 48 });
  cover.appendChild(title);
  const findingsToRender = findings.slice(0, MAX_REPORT_FINDINGS);
  let summaryText = `${findings.length} finding(s) · generated ${new Date().toISOString().slice(0, 10)}`;
  if (findings.length > MAX_REPORT_FINDINGS) {
    summaryText += ` (showing first ${MAX_REPORT_FINDINGS})`;
  }
  const summary = await createReportText(summaryText, { fontSize: 16, x: 48, y: 100 });
  cover.appendChild(summary);
  page.appendChild(cover);
  y += PAGE_HEIGHT + PAGE_GAP;

  let failedCount = 0;
  for (const finding of findingsToRender) {
    try {
      const frame = await buildFindingFrame(finding, y);
      page.appendChild(frame);
      y += PAGE_HEIGHT + PAGE_GAP;
    } catch (err) {
      // One finding failing to build (e.g. loadFontAsync rejecting) shouldn't
      // abort the rest of the report -- skip it and keep going.
      failedCount++;
      console.error("ScanA11y: failed to build report frame for finding", finding.selector, err);
    }
  }
  if (failedCount > 0) {
    console.warn(`ScanA11y: ${failedCount} finding(s) failed to render into the report`);
  }

  figma.currentPage = page;
  figma.viewport.scrollAndZoomIntoView(page.children);
  return { ok: true };
}

async function handle(msg: PluginMessage): Promise<unknown> {
  switch (msg.type) {
    case "get-selection-count":
      return figma.currentPage.selection.length;
    case "run-audit":
      return runAudit(msg.scope as "selection" | "page");
    case "highlight-node":
      return highlightNode(msg.nodeId as string);
    case "generate-report":
      return generateReport(msg.findings as Finding[]);
    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

figma.ui.onmessage = async (msg: PluginMessage) => {
  // This is an RPC pattern (unlike content-script.ts's fire-and-respond
  // router): the UI side keys a pending promise on `msg.id` and resolves it
  // when a response with a matching `id` arrives. If `msg` is malformed --
  // falsy, or missing a string `id` -- there is no id to route a response
  // back to, so attempting `figma.ui.postMessage({ id: msg.id, ... })` would
  // either throw (msg is null/undefined) or post a reply keyed on
  // undefined/garbage that no waiting promise is listening for. Either way
  // the caller would hang. The only correct move is to drop the message
  // silently: no promise was ever created for it on the UI side, so no
  // response is expected.
  if (!msg || typeof msg.id !== "string") {
    return;
  }
  try {
    const result = await handle(msg);
    figma.ui.postMessage({ id: msg.id, ok: true, result });
  } catch (e) {
    figma.ui.postMessage({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
