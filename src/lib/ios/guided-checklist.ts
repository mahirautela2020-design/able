/**
 * Guided VoiceOver / iOS Simulator checklist — the *honest* answer to dynamic
 * iOS testing. There is no tool on any non-macOS host that can drive Xcode's
 * iOS Simulator, so dynamic testing is a guided manual checklist the operator
 * runs on a Mac. Every item is explicitly `requiresMacOs: true`.
 *
 * Data only — no LLM, no fabricated "dynamic results". The UI renders these as
 * manual steps, never as executed findings.
 */

export interface GuidedChecklistItem {
  id: string;
  instruction: string;
  wcagSc: string;
  requiresMacOs: true;
}

export const IOS_GUIDED_CHECKLIST: GuidedChecklistItem[] = [
  {
    id: "voiceover-reading-order",
    instruction:
      "Open Xcode Simulator, launch the app, enable VoiceOver, and swipe through the first screen. Verify the reading order matches the visual order.",
    wcagSc: "1.3.2",
    requiresMacOs: true,
  },
  {
    id: "swipe-navigation-order",
    instruction:
      "Verify swipe-navigation focus order follows a logical sequence (top-to-bottom, left-to-right) and preserves meaning.",
    wcagSc: "2.4.3",
    requiresMacOs: true,
  },
  {
    id: "name-role-value",
    instruction:
      "Focus each interactive element with VoiceOver and confirm it announces a name, role, and current value/state.",
    wcagSc: "4.1.2",
    requiresMacOs: true,
  },
  {
    id: "image-labels",
    instruction:
      "Confirm every image, icon, and non-decorative graphic has an accessibility label (or is correctly marked decorative).",
    wcagSc: "1.1.1",
    requiresMacOs: true,
  },
  {
    id: "touch-target-size",
    instruction:
      "Verify tappable controls are at least 44×44pt and comfortably reachable.",
    wcagSc: "2.5.8",
    requiresMacOs: true,
  },
  {
    id: "text-contrast",
    instruction:
      "Review text and images-of-text against their backgrounds for sufficient contrast on a calibrated screen.",
    wcagSc: "1.4.3",
    requiresMacOs: true,
  },
  {
    id: "status-announcements",
    instruction:
      "Trigger a dynamic update (form error, loading state, toggles) and confirm VoiceOver announces the change.",
    wcagSc: "4.1.3",
    requiresMacOs: true,
  },
  {
    id: "dynamic-type",
    instruction:
      "Enable a larger Dynamic Type size and confirm text reflows without clipping or loss of function.",
    wcagSc: "1.4.4",
    requiresMacOs: true,
  },
];
