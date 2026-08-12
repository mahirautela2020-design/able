import { describe, it, expect } from "vitest";
import { buildAccessibilityTree } from "@/lib/android/accessibility-tree";
import type { AndroidAccessibilityTree } from "@/lib/android/accessibility-tree";

const fixtureTree: AndroidAccessibilityTree = {
  packageName: "com.example.app",
  activityName: "MainActivity",
  root: {
    id: "root",
    className: "android.widget.FrameLayout",
    text: "Main Screen",
    contentDescription: "App main screen",
    bounds: { x: 0, y: 0, width: 360, height: 640 },
    isClickable: false,
    isFocusable: true,
    isEnabled: true,
    isScrollable: false,
    isCheckable: false,
    isChecked: false,
    children: [
      {
        id: "button-1",
        className: "android.widget.Button",
        text: "Submit",
        contentDescription: "Submit form",
        bounds: { x: 16, y: 100, width: 328, height: 48 },
        isClickable: true,
        isFocusable: true,
        isEnabled: true,
        isScrollable: false,
        isCheckable: false,
        isChecked: false,
        children: [],
        actions: ["CLICK", "FOCUS", "LONG_CLICK"],
      },
    ],
    actions: ["FOCUS"],
  },
};

describe("mobile-tree", () => {
  describe("buildAccessibilityTree", () => {
    it("renders from manifest JSON", () => {
      const tree = buildAccessibilityTree("com.example.app", "MainActivity", {
        activities: ["com.example.app.HomeActivity"],
        permissions: ["android.permission.INTERNET"],
      });

      expect(tree.packageName).toBe("com.example.app");
      expect(tree.activityName).toBe("MainActivity");
      expect(tree.root).toBeDefined();
      expect(tree.root.children.length).toBeGreaterThanOrEqual(1);
    });

    it("has TalkBack-friendly labels on children", () => {
      const tree = buildAccessibilityTree("com.example.app", "MainActivity", {
        activities: ["com.example.app.HomeActivity"],
        permissions: [],
      });

      for (const child of tree.root.children) {
        expect(child.contentDescription).toBeTruthy();
      }
    });

    it("accessibility service permission adds label", () => {
      const tree = buildAccessibilityTree("com.example.app", "MainActivity", {
        activities: [],
        permissions: ["android.permission.BIND_ACCESSIBILITY_SERVICE"],
      });

      expect(tree.root.contentDescription).toContain("Accessibility");
    });
  });

  describe("fixture tree structure", () => {
    it("has valid structure", () => {
      const tree = fixtureTree;
      expect(tree.packageName).toBe("com.example.app");
      expect(tree.root.children.length).toBeGreaterThanOrEqual(1);
    });

    it("child has talkback label", () => {
      expect(fixtureTree.root.children[0].contentDescription).toBeTruthy();
    });
  });
});
