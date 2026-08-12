import type { Finding } from "@/engine/axe-scan";
import type { AriaNode } from "./snapshot";

export interface LinkedFinding {
  finding: Finding;
  ariaNode: AriaNode | null;
}

function findNodeBySelector(
  root: AriaNode,
  selector: string
): AriaNode | null {
  const idMatch = selector.match(/#([\w-]+)/);
  if (idMatch && root.name?.includes(idMatch[1])) {
    return root;
  }

  const cleanSelector = selector.replace(/>>>/g, " ");
  const parts = cleanSelector
    .split(/\s+/)
    .filter((p) => p.length > 0);

  if (root.role && parts.some((p) => p === root.role)) {
    return root;
  }

  for (const child of root.children) {
    const result = findNodeBySelector(child, selector);
    if (result) return result;
  }

  return null;
}

function findNodeByRoleName(
  root: AriaNode,
  role: string,
  name: string
): AriaNode | null {
  if (
    root.role === role &&
    name &&
    root.name?.toLowerCase().includes(name.toLowerCase())
  ) {
    return root;
  }

  for (const child of root.children) {
    const result = findNodeByRoleName(child, role, name);
    if (result) return result;
  }

  return null;
}

function extractRoleNameFromSelector(selector: string): {
  role: string;
  name: string;
} {
  const parts = selector.split(/\s+/);
  let role = "";
  let name = "";

  for (const part of parts) {
    if (part.startsWith("[role=") || part.startsWith('role=')) {
      role = part.replace(/^\[?role="?/, "").replace(/"?\]?$/, "");
    }
    if (part.startsWith("#")) {
      name = part.slice(1);
    }
    if (part.match(/^[a-z_-]+$/i) && !part.startsWith(".") && !part.startsWith("#")) {
      if (!role) role = part;
    }
  }

  return { role, name };
}

export function linkFindingsToAria(
  findings: Finding[],
  ariaSnapshot: AriaNode | null
): LinkedFinding[] {
  if (!ariaSnapshot) {
    return findings.map((f) => ({ finding: f, ariaNode: null }));
  }

  return findings.map((f) => {
    if (!f.selector) {
      return { finding: f, ariaNode: null };
    }

    let node = findNodeBySelector(ariaSnapshot, f.selector);

    if (!node) {
      const { role, name } = extractRoleNameFromSelector(f.selector);
      if (role) {
        node = findNodeByRoleName(ariaSnapshot, role, name);
      }
    }

    return { finding: f, ariaNode: node };
  });
}
