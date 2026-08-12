import { describe, it, expect } from "vitest";
import { captureAriaSnapshot } from "@/lib/sr/snapshot";

describe("sr/snapshot", () => {
  it("returns null when no page is available", async () => {
    const result = await captureAriaSnapshot({
      accessibility: { snapshot: async () => null },
    } as unknown as Parameters<typeof captureAriaSnapshot>[0]);
    expect(result).toBeNull();
  });

  it("normalizes a raw snapshot to AriaNode shape", async () => {
    const result = await captureAriaSnapshot({
      accessibility: {
        snapshot: async () => ({
          role: "WebArea",
          name: "Test Page",
          children: [
            {
              role: "heading",
              name: "Title",
              level: 1,
              children: [{ role: "statictext", name: "Title" }],
            },
            {
              role: "button",
              name: "Submit",
              children: [{ role: "statictext", name: "Submit" }],
            },
          ],
        }),
      },
    } as unknown as Parameters<typeof captureAriaSnapshot>[0]);

    expect(result).not.toBeNull();
    expect(result!.role).toBe("WebArea");
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
});
