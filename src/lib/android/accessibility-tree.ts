export interface AndroidAccessibilityNode {
  id: string;
  className: string;
  text: string;
  contentDescription: string;
  bounds: { x: number; y: number; width: number; height: number };
  isClickable: boolean;
  isFocusable: boolean;
  isEnabled: boolean;
  isScrollable: boolean;
  isCheckable: boolean;
  isChecked: boolean;
  children: AndroidAccessibilityNode[];
  actions: string[];
}

export interface AndroidAccessibilityTree {
  packageName: string;
  activityName: string;
  root: AndroidAccessibilityNode;
}

export function buildAccessibilityTree(
  packageName: string,
  activityName: string,
  manifestJson: Record<string, unknown>
): AndroidAccessibilityTree {
  const activities = (manifestJson.activities as string[]) || [];
  const permissions = (manifestJson.permissions as string[]) || [];

  const activityNode: AndroidAccessibilityNode = {
    id: activityName || "root",
    className: "android.app.Activity",
    text: activityName || "",
    contentDescription: "",
    bounds: { x: 0, y: 0, width: 360, height: 640 },
    isClickable: false,
    isFocusable: true,
    isEnabled: true,
    isScrollable: false,
    isCheckable: false,
    isChecked: false,
    children: [],
    actions: ["FOCUS"],
  };

  for (const perm of permissions) {
    if (perm.includes("ACCESSIBILITY")) {
      activityNode.contentDescription = "Accessibility service active";
    }
  }

  for (let i = 0; i < Math.min(activities.length, 5); i++) {
    const activity = activities[i];
    activityNode.children.push({
      id: `activity-${i}`,
      className: activity,
      text: activity.split(".").pop() || activity,
      contentDescription: `Navigate to ${activity.split(".").pop() || "screen"}`,
      bounds: { x: 10, y: 50 + i * 80, width: 340, height: 70 },
      isClickable: true,
      isFocusable: true,
      isEnabled: true,
      isScrollable: false,
      isCheckable: false,
      isChecked: false,
      children: [],
      actions: ["CLICK", "FOCUS", "LONG_CLICK"],
    });
  }

  return {
    packageName: packageName || "com.example.app",
    activityName: activityName || "MainActivity",
    root: activityNode,
  };
}

export function parseAccessibilityTreeFromJson(json: string): AndroidAccessibilityTree {
  return JSON.parse(json) as AndroidAccessibilityTree;
}
