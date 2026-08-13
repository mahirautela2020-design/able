import type { IosBundle } from "./ipa";

/**
 * Deterministic static checks on a parsed iOS bundle.
 *
 * GUARDRAILS (ENTERPRISE_SPEC §2): bundle metadata cannot prove a *live*
 * accessibility failure (VoiceOver behavior, rendered contrast, actual tap
 * targets), so EVERY finding here is `needs_review` — never a hard violation.
 * There is no LLM in this path; every message is templated from measured
 * presence/absence of keys.
 */

export interface IosStaticFinding {
  ruleId: string;
  /** WCAG success criterion id (e.g. "1.3.1"). */
  criterion: string;
  severity: "needs_review";
  source: "ios-static";
  /** Where in the bundle the evidence lives (e.g. `Payload/App.app/Info.plist`). */
  element: string;
  message: string;
  evidence: Record<string, unknown>;
}

function finding(
  ruleId: string,
  criterion: string,
  element: string,
  message: string,
  evidence: Record<string, unknown>
): IosStaticFinding {
  return { ruleId, criterion, severity: "needs_review", source: "ios-static", element, message, evidence };
}

/**
 * Run all static checks. Returns [] when the plist was unreadable — a
 * structure we cannot see produces no fabricated findings.
 */
export function runIosChecks(bundle: IosBundle): IosStaticFinding[] {
  if (!bundle.plistReadable) return [];

  const findings: IosStaticFinding[] = [];
  const element = "Payload/*.app/Info.plist";

  // 1.3.1 Info and Relationships — a missing display name means the app has no
  // human-readable name to announce; needs manual review.
  if (!bundle.displayName) {
    findings.push(
      finding(
        "ios-display-name-missing",
        "1.3.1",
        element,
        "CFBundleDisplayName is absent — the app may have no announced name. Review the home-screen label and VoiceOver announcement.",
        { key: "CFBundleDisplayName" }
      )
    );
  }

  // 3.1.1 Language of Page — no localizations declared means language metadata
  // may be missing; VoiceOver language detection needs review.
  if (!bundle.localizations || bundle.localizations.length === 0) {
    findings.push(
      finding(
        "ios-localizations-missing",
        "3.1.1",
        element,
        "CFBundleLocalizations is absent — declared languages cannot be verified. Review supported locales and VoiceOver language behavior.",
        { key: "CFBundleLocalizations" }
      )
    );
  }

  // 2.2.2 Pause, Stop, Hide — a launch storyboard absence is a weak proxy for
  // motion/animation control; only a manual review can confirm.
  if (!bundle.launchStoryboard) {
    findings.push(
      finding(
        "ios-launch-storyboard-missing",
        "2.2.2",
        element,
        "UILaunchStoryboardName is absent — launch experience (splash, motion, auto-advance) cannot be verified statically. Review on a simulator.",
        { key: "UILaunchStoryboardName" }
      )
    );
  }

  // 1.4.11 Non-text Contrast — icon variants are required for crisp rendering
  // across densities; missing @2x/@3x needs review as an asset-completeness flag.
  if (bundle.iconNames2x.length === 0 || bundle.iconNames3x.length === 0) {
    findings.push(
      finding(
        "ios-icon-variants-incomplete",
        "1.4.11",
        "Payload/*.app/",
        `Icon set is incomplete: found ${bundle.iconNames2x.length} @2x and ${bundle.iconNames3x.length} @3x variants. Review icon completeness for every device density.`,
        { iconNames2x: bundle.iconNames2x, iconNames3x: bundle.iconNames3x }
      )
    );
  }

  return findings;
}
