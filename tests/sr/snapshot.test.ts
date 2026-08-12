import { describe, it, expect } from "vitest";
import { captureAriaSnapshot } from "@/lib/sr/snapshot";

type PageArg = Parameters<typeof captureAriaSnapshot>[0];

function mockPage(nodes: unknown[]): PageArg {
  const session = {
    send: async () => ({ nodes }),
  };
  return {
    context: () => ({ newCDPSession: async () => session }),
  } as unknown as PageArg;
}

describe("sr/snapshot", () => {
  it("returns null when the AX tree is empty", async () => {
    const result = await captureAriaSnapshot(mockPage([]));
    expect(result).toBeNull();
  });

  it("returns null when the CDP session throws", async () => {
    const page = {
      context: () => ({
        newCDPSession: async () => {
          throw new Error("cdp unavailable");
        },
      }),
    } as unknown as PageArg;
    expect(await captureAriaSnapshot(page)).toBeNull();
  });

  it("normalizes the raw CDP AX tree to AriaNode shape", async () => {
    const nodes = [
      { nodeId: "root", role: { value: "RootWebArea" }, name: { value: "Test Page" }, childIds: ["h1", "btn"] },
      {
        nodeId: "h1",
        role: { value: "heading" },
        name: { value: "Title" },
        parentId: "root",
        properties: [{ name: "level", value: { type: "integer", value: 1 } }],
        childIds: ["h1t"],
      },
      { nodeId: "h1t", role: { value: "statictext" }, name: { value: "Title" }, parentId: "h1" },
      { nodeId: "btn", role: { value: "button" }, name: { value: "Submit" }, parentId: "root", childIds: ["btnt"] },
      { nodeId: "btnt", role: { value: "statictext" }, name: { value: "Submit" }, parentId: "btn" },
    ];

    const result = await captureAriaSnapshot(mockPage(nodes));

    expect(result).not.toBeNull();
    expect(result!.role).toBe("RootWebArea");
    expect(result!.name).toBe("Test Page");
    expect(result!.children).toHaveLength(2);

    const heading = result!.children[0];
    expect(heading.role).toBe("heading");
    expect(heading.name).toBe("Title");
    expect(heading.level).toBe(1);

    const button = result!.children[1];
    expect(button.role).toBe("button");
    expect(button.name).toBe("Submit");
  });

  it("promotes children of ignored presentational nodes", async () => {
    const nodes = [
      { nodeId: "root", role: { value: "RootWebArea" }, name: { value: "" }, childIds: ["ignored"] },
      { nodeId: "ignored", ignored: true, parentId: "root", childIds: ["btn"] },
      { nodeId: "btn", role: { value: "button" }, name: { value: "Go" }, parentId: "ignored" },
    ];

    const result = await captureAriaSnapshot(mockPage(nodes));

    expect(result).not.toBeNull();
    expect(result!.children).toHaveLength(1);
    expect(result!.children[0].role).toBe("button");
    expect(result!.children[0].name).toBe("Go");
  });
});
