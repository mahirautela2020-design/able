import type { Page } from "playwright-core";

export interface AriaNode {
  role: string;
  name: string;
  level?: number;
  children: AriaNode[];
}

interface AriaSnapshotRaw {
  role: string;
  name?: string;
  level?: number;
  children?: AriaSnapshotRaw[];
}

function normalize(raw: AriaSnapshotRaw): AriaNode {
  return {
    role: raw.role ?? "unknown",
    name: raw.name ?? "",
    ...(raw.level !== undefined ? { level: raw.level } : {}),
    children: (raw.children ?? []).map(normalize),
  };
}

export async function captureAriaSnapshot(
  page: Page
): Promise<AriaNode | null> {
  const raw = await (page as Page & { accessibility: { snapshot: () => Promise<AriaSnapshotRaw | null> } })
    .accessibility.snapshot()
    .catch(() => null);
  if (!raw) return null;
  return normalize(raw as AriaSnapshotRaw);
}
