import { getWcagRegistry } from "@/engine/wcag-registry";

export interface AuditModule {
  id: string;
  name: string;
  description: string;
  engine: string;
  wcagScIds: string[];
  estimatedRuntimeMs: number;
  optional: boolean;
}

export interface ModulePreset {
  id: string;
  name: string;
  description: string;
  moduleIds: string[];
}

export interface ModuleSelection {
  moduleId: string;
  enabled: boolean;
}

const WCAG_REGISTRY = getWcagRegistry();

function allAutomatableScIds(): string[] {
  return WCAG_REGISTRY.filter((sc) => !sc.manualTest).map((sc) => sc.id);
}

export const AUDIT_MODULES: AuditModule[] = [
  {
    id: "automated",
    name: "Automated A/AA/AAA",
    description: "Runs axe-core 4.13 on every page. Covers all automatable WCAG 2.2 success criteria across levels A, AA, and AAA.",
    engine: "axe-core 4.13",
    wcagScIds: allAutomatableScIds(),
    estimatedRuntimeMs: 30_000,
    optional: false,
  },
  {
    id: "needs-review",
    name: "Needs Review",
    description: "Surfaces axe-core incomplete results that require human judgment — false positives, complex widgets, and ambiguous markup.",
    engine: "axe incomplete",
    wcagScIds: allAutomatableScIds(),
    estimatedRuntimeMs: 0,
    optional: false,
  },
  {
    id: "keyboard",
    name: "Keyboard Behavior",
    description: "Playwright-driven Tab walkthrough. Detects focus traps, missing focus styles, order-vs-layout mismatch, and keyboard-only operability.",
    engine: "Playwright walkthrough",
    wcagScIds: ["2.1.1", "2.1.2", "2.4.1", "2.4.3", "2.4.7", "2.4.11"],
    estimatedRuntimeMs: 60_000,
    optional: true,
  },
  {
    id: "aria",
    name: "ARIA Structure",
    description: "Validates ARIA roles, states, properties, and the accessibility tree via axe-core and AX snapshot inspection.",
    engine: "axe + AX tree",
    wcagScIds: ["4.1.2", "4.1.3"],
    estimatedRuntimeMs: 15_000,
    optional: true,
  },
  {
    id: "contrast",
    name: "Contrast & Color-Blind",
    description: "Computes contrast ratios for every text/background pair. Runs protanopia, deuteranopia, and tritanopia simulations to flag CVD-only failures.",
    engine: "contrast engine + sim matrices",
    wcagScIds: ["1.4.3", "1.4.6", "1.4.11"],
    estimatedRuntimeMs: 45_000,
    optional: true,
  },
  {
    id: "touch-targets",
    name: "Touch Targets",
    description: "Geometry check on every interactive element. Flags targets below 24×24 px (2.5.8 AA) and below 44×44 px (2.5.5 AAA).",
    engine: "geometry checks",
    wcagScIds: ["2.5.5", "2.5.8"],
    estimatedRuntimeMs: 20_000,
    optional: true,
  },
  {
    id: "responsive",
    name: "Responsive (Mobile/Tablet/Web)",
    description: "Scans at mobile (375 px), tablet (768 px), and desktop (1280 px) viewports. Checks reflow, text resize, and orientation.",
    engine: "multi-viewport scans",
    wcagScIds: ["1.4.4", "1.4.10"],
    estimatedRuntimeMs: 90_000,
    optional: true,
  },
  {
    id: "screen-reader",
    name: "Screen Reader",
    description: "Accessibility tree assertions across all 4 screen-reader patterns, plus guided NVDA scripts. Includes read-along simulation.",
    engine: "tree assertions + guided scripts",
    wcagScIds: ["1.1.1", "4.1.2", "4.1.3"],
    estimatedRuntimeMs: 120_000,
    optional: true,
  },
  {
    id: "performance",
    name: "Performance",
    description: "Lighthouse core audit (optional). Provides page-speed context but is not a WCAG requirement.",
    engine: "Lighthouse core",
    wcagScIds: [],
    estimatedRuntimeMs: 30_000,
    optional: true,
  },
  {
    id: "manual-checklist",
    name: "Manual Checklist",
    description: "Guided tests covering the ~60% of WCAG SCs that cannot be fully automated. Step-by-step instructions for each criterion.",
    engine: "guided tests",
    wcagScIds: WCAG_REGISTRY.filter((sc) => sc.manualTest).map((sc) => sc.id),
    estimatedRuntimeMs: 0,
    optional: true,
  },
];

export const MODULE_PRESETS: ModulePreset[] = [
  {
    id: "quick",
    name: "Quick",
    description: "Automated scan + keyboard walkthrough. Good for a fast first pass.",
    moduleIds: ["automated", "needs-review", "keyboard"],
  },
  {
    id: "standard",
    name: "Standard",
    description: "Quick + contrast, touch targets, ARIA, and needs review. Covers the most common accessibility issues.",
    moduleIds: ["automated", "needs-review", "keyboard", "aria", "contrast", "touch-targets"],
  },
  {
    id: "compliance",
    name: "Compliance",
    description: "Standard + responsive checks + manual checklist. Ready for a conformance report.",
    moduleIds: ["automated", "needs-review", "keyboard", "aria", "contrast", "touch-targets", "responsive", "manual-checklist"],
  },
  {
    id: "full",
    name: "Full",
    description: "Every module enabled. Screen reader, performance, and the complete manual checklist.",
    moduleIds: AUDIT_MODULES.map((m) => m.id),
  },
];

export function getModuleById(id: string): AuditModule | undefined {
  return AUDIT_MODULES.find((m) => m.id === id);
}

export function getPresetById(id: string): ModulePreset | undefined {
  return MODULE_PRESETS.find((p) => p.id === id);
}

export function getModuleWcagCoverage(moduleIds: string[]): string[] {
  const scSet = new Set<string>();
  for (const id of moduleIds) {
    const mod = getModuleById(id);
    if (mod) {
      for (const sc of mod.wcagScIds) {
        scSet.add(sc);
      }
    }
  }
  return Array.from(scSet).sort();
}

export function totalEstimatedRuntime(moduleIds: string[]): number {
  return moduleIds.reduce((sum, id) => {
    const mod = getModuleById(id);
    return sum + (mod?.estimatedRuntimeMs ?? 0);
  }, 0);
}

export function formatRuntime(ms: number): string {
  if (ms === 0) return "—";
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function getRequiredModuleIds(): string[] {
  return AUDIT_MODULES.filter((m) => !m.optional).map((m) => m.id);
}
