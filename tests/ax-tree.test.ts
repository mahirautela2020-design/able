import { describe, it, expect, vi } from "vitest";
import { captureAxTree, type CdpSessionLike } from "@/engine/ax-tree";
import type { Page } from "playwright-core";

/** Builds a fake Page whose CDP session responds to the three methods
 * captureAxTree needs, driven by a caller-supplied per-method responder. */
function fakePage(respond: (method: string, params?: Record<string, unknown>) => unknown): Page {
  const session: CdpSessionLike & { detach: () => Promise<void> } = {
    send: vi.fn(async (method: string, params?: Record<string, unknown>) => respond(method, params)),
    detach: vi.fn(async () => {}),
  };
  return {
    context: () => ({
      newCDPSession: async () => session,
    }),
  } as unknown as Page;
}

describe("captureAxTree — rect/domTag enrichment", () => {
  it("populates real rect and domTag from DOM.getBoxModel / DOM.describeNode, not null", async () => {
    const page = fakePage((method, params) => {
      if (method === "Accessibility.getFullAXTree") {
        return {
          nodes: [
            {
              nodeId: "1",
              role: { value: "button" },
              name: { value: "Submit" },
              backendDOMNodeId: 42,
              properties: [{ name: "focusable", value: { value: true } }],
            },
          ],
        };
      }
      if (method === "DOM.describeNode") {
        expect(params).toEqual({ backendNodeId: 42 });
        return { node: { localName: "BUTTON" } };
      }
      if (method === "DOM.getBoxModel") {
        expect(params).toEqual({ backendNodeId: 42 });
        return { model: { content: [10, 20, 110, 20, 110, 60, 10, 60], width: 100, height: 40 } };
      }
      throw new Error(`unexpected CDP method: ${method}`);
    });

    const nodes = await captureAxTree(page);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].domTag).toBe("button");
    expect(nodes[0].rect).toEqual({ x: 10, y: 20, width: 100, height: 40 });
  });

  it("degrades gracefully to null rect/domTag when CDP enrichment calls fail", async () => {
    const page = fakePage((method) => {
      if (method === "Accessibility.getFullAXTree") {
        return {
          nodes: [
            {
              nodeId: "1",
              role: { value: "link" },
              name: { value: "Home" },
              backendDOMNodeId: 7,
            },
          ],
        };
      }
      if (method === "DOM.describeNode" || method === "DOM.getBoxModel") {
        throw new Error("No node with given id found");
      }
      throw new Error(`unexpected CDP method: ${method}`);
    });

    const nodes = await captureAxTree(page);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].rect).toBeNull();
    expect(nodes[0].domTag).toBeNull();
  });

  it("skips enrichment for invisible, nameless, non-focusable nodes (bounds CDP round-trips)", async () => {
    const describeNode = vi.fn();
    const page = fakePage((method) => {
      if (method === "Accessibility.getFullAXTree") {
        return {
          nodes: [
            {
              nodeId: "1",
              role: { value: "generic" },
              backendDOMNodeId: 99,
              properties: [{ name: "hidden", value: { value: true } }],
            },
          ],
        };
      }
      if (method === "DOM.describeNode") {
        describeNode();
        return { node: { localName: "div" } };
      }
      if (method === "DOM.getBoxModel") {
        return { model: { content: [0, 0], width: 1, height: 1 } };
      }
      throw new Error(`unexpected CDP method: ${method}`);
    });

    const nodes = await captureAxTree(page);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].rect).toBeNull();
    expect(nodes[0].domTag).toBeNull();
    expect(describeNode).not.toHaveBeenCalled();
  });
});
