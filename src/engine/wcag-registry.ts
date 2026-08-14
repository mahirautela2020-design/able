export interface WcagSuccessCriterion {
  id: string;
  name: string;
  level: "A" | "AA" | "AAA";
  principle: string;
  summary: string;
  manualTest: boolean;
}

export function getWcagRegistry(): WcagSuccessCriterion[] {
  return WCAG_REGISTRY.slice();
}

export function getScById(
  id: string
): WcagSuccessCriterion | undefined {
  return WCAG_REGISTRY.find((sc) => sc.id === id);
}

export function deriveRuleMappings(): Map<string, string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const axe = require("axe-core");
  const mapping = new Map<string, string[]>();

  // Must match axe-scan.ts's AXE_RUN_TAGS (minus "best-practice", which
  // isn't a WCAG-level tag) — omitting the *aaa tags here would silently
  // drop AAA-only rules (color-contrast-enhanced, identical-links-same-purpose,
  // meta-refresh-no-exceptions) from axe.getRules()'s result entirely, so
  // their violations could never resolve to a WCAG SC id.
  const rules: Array<{ ruleId: string; tags: string[] }> = axe.getRules([
    "wcag2a",
    "wcag2aa",
    "wcag2aaa",
    "wcag21a",
    "wcag21aa",
    "wcag21aaa",
    "wcag22aa",
    "wcag22aaa",
    "best-practice",
  ]);

  const registryIds = new Set(WCAG_REGISTRY.map((sc) => sc.id));

  for (const rule of rules) {
    const wcagTags = rule.tags
      .filter(
        (t: string) =>
          (t.startsWith("wcag") || t.startsWith("section508")) &&
          !t.startsWith("wcag2") &&
          !t.startsWith("wcag21") &&
          !t.startsWith("wcag22")
      )
      .map(normalizeTag);

    const validTags = wcagTags.filter((t: string) => registryIds.has(t));
    mapping.set(rule.ruleId, validTags);
  }

  return mapping;
}

/** Every SC id that at least one enabled axe-core rule can actually detect —
 * i.e. the real, current coverage of the "automated" module, as opposed to
 * `allAutomatableScIds()` (every SC the registry merely marks non-manual,
 * regardless of whether any rule tests it). Used to keep the compliance
 * matrix's "was this SC actually tested" set honest. */
export function axeCoveredScIds(): string[] {
  const ids = new Set<string>();
  for (const scIds of deriveRuleMappings().values()) {
    for (const id of scIds) ids.add(id);
  }
  return Array.from(ids).sort();
}

/** Normalizes an axe-core-style tag ("wcag143") to the registry's dotted SC
 * id format ("1.4.3"). Already-dotted input (or a non-SC tag like a level
 * tag "wcag2aa") passes through unchanged — safe to call on any tag string
 * without knowing its source convention first. */
export function normalizeTag(tag: string): string {
  const match = tag.match(/^wcag(\d)(\d)(\d+)$/);
  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}`;
  }
  return tag;
}

const WCAG_REGISTRY: WcagSuccessCriterion[] = [
  {
    id: "1.1.1",
    name: "Non-text Content",
    level: "A",
    principle: "Perceivable",
    summary:
      "All non-text content that is presented to the user has a text alternative that serves the equivalent purpose.",
    manualTest: true,
  },
  {
    id: "1.2.1",
    name: "Audio-only and Video-only (Prerecorded)",
    level: "A",
    principle: "Perceivable",
    summary:
      "For prerecorded audio-only and prerecorded video-only media, provide a text alternative.",
    manualTest: true,
  },
  {
    id: "1.2.2",
    name: "Captions (Prerecorded)",
    level: "A",
    principle: "Perceivable",
    summary: "Captions are provided for all prerecorded audio content.",
    manualTest: true,
  },
  {
    id: "1.2.3",
    name: "Audio Description or Media Alternative (Prerecorded)",
    level: "A",
    principle: "Perceivable",
    summary:
      "An alternative for time-based media or audio description of the prerecorded video content is provided.",
    manualTest: true,
  },
  {
    id: "1.2.4",
    name: "Captions (Live)",
    level: "AA",
    principle: "Perceivable",
    summary: "Captions are provided for all live audio content.",
    manualTest: true,
  },
  {
    id: "1.2.5",
    name: "Audio Description (Prerecorded)",
    level: "AA",
    principle: "Perceivable",
    summary:
      "Audio description is provided for all prerecorded video content.",
    manualTest: true,
  },
  {
    id: "1.2.6",
    name: "Sign Language (Prerecorded)",
    level: "AAA",
    principle: "Perceivable",
    summary:
      "Sign language interpretation is provided for all prerecorded audio content.",
    manualTest: true,
  },
  {
    id: "1.2.7",
    name: "Extended Audio Description (Prerecorded)",
    level: "AAA",
    principle: "Perceivable",
    summary:
      "Where pauses in foreground audio are insufficient to allow audio descriptions, extended audio description is provided.",
    manualTest: true,
  },
  {
    id: "1.2.8",
    name: "Media Alternative (Prerecorded)",
    level: "AAA",
    principle: "Perceivable",
    summary:
      "An alternative for time-based media is provided for all prerecorded synchronized media.",
    manualTest: true,
  },
  {
    id: "1.2.9",
    name: "Audio-only (Live)",
    level: "AAA",
    principle: "Perceivable",
    summary:
      "An alternative for time-based media that presents equivalent information for live audio-only content is provided.",
    manualTest: true,
  },
  {
    id: "1.3.1",
    name: "Info and Relationships",
    level: "A",
    principle: "Perceivable",
    summary:
      "Information, structure, and relationships conveyed through presentation can be programmatically determined or are available in text.",
    manualTest: false,
  },
  {
    id: "1.3.2",
    name: "Meaningful Sequence",
    level: "A",
    principle: "Perceivable",
    summary:
      "When the sequence in which content is presented affects its meaning, a correct reading sequence can be programmatically determined.",
    manualTest: false,
  },
  {
    id: "1.3.3",
    name: "Sensory Characteristics",
    level: "A",
    principle: "Perceivable",
    summary:
      "Instructions provided for understanding and operating content do not rely solely on sensory characteristics.",
    manualTest: true,
  },
  {
    id: "1.3.4",
    name: "Orientation",
    level: "AA",
    principle: "Perceivable",
    summary:
      "Content does not restrict its view and operation to a single display orientation.",
    manualTest: true,
  },
  {
    id: "1.3.5",
    name: "Identify Input Purpose",
    level: "AA",
    principle: "Perceivable",
    summary:
      "The purpose of each input field collecting information about the user can be programmatically determined.",
    manualTest: false,
  },
  {
    id: "1.3.6",
    name: "Identify Purpose",
    level: "AAA",
    principle: "Perceivable",
    summary:
      "In content implemented using markup languages, the purpose of user interface components, icons, and regions can be programmatically determined.",
    manualTest: false,
  },
  {
    id: "1.4.1",
    name: "Use of Color",
    level: "A",
    principle: "Perceivable",
    summary:
      "Color is not used as the only visual means of conveying information.",
    manualTest: true,
  },
  {
    id: "1.4.2",
    name: "Audio Control",
    level: "A",
    principle: "Perceivable",
    summary:
      "If any audio on a web page plays automatically, a mechanism is available to pause or stop the audio.",
    manualTest: true,
  },
  {
    id: "1.4.3",
    name: "Contrast (Minimum)",
    level: "AA",
    principle: "Perceivable",
    summary:
      "The visual presentation of text and images of text has a contrast ratio of at least 4.5:1.",
    manualTest: false,
  },
  {
    id: "1.4.4",
    name: "Resize Text",
    level: "AA",
    principle: "Perceivable",
    summary:
      "Text can be resized without assistive technology up to 200 percent without loss of content or functionality.",
    manualTest: true,
  },
  {
    id: "1.4.5",
    name: "Images of Text",
    level: "AA",
    principle: "Perceivable",
    summary:
      "Text is used to convey information rather than images of text.",
    manualTest: true,
  },
  {
    id: "1.4.6",
    name: "Contrast (Enhanced)",
    level: "AAA",
    principle: "Perceivable",
    summary:
      "The visual presentation of text and images of text has a contrast ratio of at least 7:1.",
    manualTest: false,
  },
  {
    id: "1.4.7",
    name: "Low or No Background Audio",
    level: "AAA",
    principle: "Perceivable",
    summary:
      "Audio content does not contain background sounds or can be turned off.",
    manualTest: true,
  },
  {
    id: "1.4.8",
    name: "Visual Presentation",
    level: "AAA",
    principle: "Perceivable",
    summary:
      "A mechanism is available for users to select foreground and background colors, line spacing, etc.",
    manualTest: true,
  },
  {
    id: "1.4.9",
    name: "Images of Text (No Exception)",
    level: "AAA",
    principle: "Perceivable",
    summary:
      "Images of text are only used for pure decoration or where text cannot be replaced.",
    manualTest: true,
  },
  {
    id: "1.4.10",
    name: "Reflow",
    level: "AA",
    principle: "Perceivable",
    summary:
      "Content can be presented without loss of information or functionality, and without requiring scrolling in two dimensions.",
    manualTest: true,
  },
  {
    id: "1.4.11",
    name: "Non-text Contrast",
    level: "AA",
    principle: "Perceivable",
    summary:
      "The visual presentation of user interface components and graphical objects has a contrast ratio of at least 3:1 against adjacent colors.",
    manualTest: false,
  },
  {
    id: "1.4.12",
    name: "Text Spacing",
    level: "AA",
    principle: "Perceivable",
    summary:
      "No loss of content or functionality occurs when the user adapts paragraph spacing to 2 times the font size, etc.",
    manualTest: true,
  },
  {
    id: "1.4.13",
    name: "Content on Hover or Focus",
    level: "AA",
    principle: "Perceivable",
    summary:
      "Content that appears on hover or focus is dismissible, hoverable, and persistent.",
    manualTest: true,
  },
  {
    id: "2.1.1",
    name: "Keyboard",
    level: "A",
    principle: "Operable",
    summary:
      "All functionality of the content is operable through a keyboard interface.",
    manualTest: false,
  },
  {
    id: "2.1.2",
    name: "No Keyboard Trap",
    level: "A",
    principle: "Operable",
    summary:
      "If keyboard focus can be moved to a component using a keyboard interface, focus can be moved away using only a keyboard interface.",
    manualTest: false,
  },
  {
    id: "2.1.3",
    name: "Keyboard (No Exception)",
    level: "AAA",
    principle: "Operable",
    summary:
      "All functionality of the content is operable through a keyboard interface without requiring specific timings for individual keystrokes.",
    manualTest: true,
  },
  {
    id: "2.1.4",
    name: "Character Key Shortcuts",
    level: "A",
    principle: "Operable",
    summary:
      "If a keyboard shortcut is implemented using only letter, punctuation, number, or symbol characters, it can be turned off or remapped.",
    manualTest: true,
  },
  {
    id: "2.2.1",
    name: "Timing Adjustable",
    level: "A",
    principle: "Operable",
    summary:
      "For each time limit, users are able to turn off, adjust, or extend the time limit.",
    manualTest: true,
  },
  {
    id: "2.2.2",
    name: "Pause, Stop, Hide",
    level: "A",
    principle: "Operable",
    summary:
      "Moving, blinking, scrolling, or auto-updating information can be paused, stopped, or hidden.",
    manualTest: true,
  },
  {
    id: "2.2.3",
    name: "No Timing",
    level: "AAA",
    principle: "Operable",
    summary:
      "Timing is not an essential part of the event or activity presented by the content.",
    manualTest: true,
  },
  {
    id: "2.2.4",
    name: "Interruptions",
    level: "AAA",
    principle: "Operable",
    summary:
      "Interruptions can be postponed or suppressed by the user.",
    manualTest: true,
  },
  {
    id: "2.2.5",
    name: "Re-authenticating",
    level: "AAA",
    principle: "Operable",
    summary:
      "When an authenticated session expires, the user can continue the activity without loss of data after re-authenticating.",
    manualTest: true,
  },
  {
    id: "2.2.6",
    name: "Timeouts",
    level: "AAA",
    principle: "Operable",
    summary:
      "Users are warned of the duration of any user inactivity that could cause data loss.",
    manualTest: true,
  },
  {
    id: "2.3.1",
    name: "Three Flashes or Below Threshold",
    level: "A",
    principle: "Operable",
    summary: "Web pages do not contain anything that flashes more than three times in any one second period.",
    manualTest: true,
  },
  {
    id: "2.3.2",
    name: "Three Flashes",
    level: "AAA",
    principle: "Operable",
    summary: "Web pages do not contain anything that flashes more than three times per second.",
    manualTest: true,
  },
  {
    id: "2.3.3",
    name: "Animation from Interactions",
    level: "AAA",
    principle: "Operable",
    summary:
      "Motion animation triggered by interaction can be disabled.",
    manualTest: true,
  },
  {
    id: "2.4.1",
    name: "Bypass Blocks",
    level: "A",
    principle: "Operable",
    summary:
      "A mechanism is available to bypass blocks of content that are repeated on multiple web pages.",
    manualTest: false,
  },
  {
    id: "2.4.2",
    name: "Page Titled",
    level: "A",
    principle: "Operable",
    summary: "Web pages have titles that describe topic or purpose.",
    manualTest: false,
  },
  {
    id: "2.4.3",
    name: "Focus Order",
    level: "A",
    principle: "Operable",
    summary:
      "If a web page can be navigated sequentially and the navigation sequences affect meaning or operation, focusable components receive focus in an order that preserves meaning and operability.",
    manualTest: false,
  },
  {
    id: "2.4.4",
    name: "Link Purpose (In Context)",
    level: "A",
    principle: "Operable",
    summary:
      "The purpose of each link can be determined from the link text alone or from the link text together with its programmatically determined link context.",
    manualTest: false,
  },
  {
    id: "2.4.5",
    name: "Multiple Ways",
    level: "AA",
    principle: "Operable",
    summary:
      "More than one way is available to locate a Web page within a set of Web pages.",
    manualTest: true,
  },
  {
    id: "2.4.6",
    name: "Headings and Labels",
    level: "AA",
    principle: "Operable",
    summary: "Headings and labels describe topic or purpose.",
    manualTest: false,
  },
  {
    id: "2.4.7",
    name: "Focus Visible",
    level: "AA",
    principle: "Operable",
    summary:
      "Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible.",
    manualTest: false,
  },
  {
    id: "2.4.8",
    name: "Location",
    level: "AAA",
    principle: "Operable",
    summary:
      "Information about the user's location within a set of Web pages is available.",
    manualTest: true,
  },
  {
    id: "2.4.9",
    name: "Link Purpose (Link Only)",
    level: "AAA",
    principle: "Operable",
    summary:
      "A mechanism is available to allow the purpose of each link to be identified from link text alone.",
    manualTest: true,
  },
  {
    id: "2.4.10",
    name: "Section Headings",
    level: "AAA",
    principle: "Operable",
    summary:
      "Section headings are used to organize the content.",
    manualTest: true,
  },
  {
    id: "2.4.11",
    name: "Focus Not Obscured (Minimum)",
    level: "AA",
    principle: "Operable",
    summary:
      "When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content.",
    manualTest: false,
  },
  {
    id: "2.4.12",
    name: "Focus Not Obscured (Enhanced)",
    level: "AAA",
    principle: "Operable",
    summary:
      "When a user interface component receives keyboard focus, no part of the component is hidden by author-created content.",
    manualTest: false,
  },
  {
    id: "2.4.13",
    name: "Focus Appearance",
    level: "AAA",
    principle: "Operable",
    summary:
      "When the keyboard focus indicator is visible, it meets minimum area and contrast requirements.",
    manualTest: false,
  },
  {
    id: "2.5.1",
    name: "Pointer Gestures",
    level: "A",
    principle: "Operable",
    summary:
      "All functionality that uses multipoint or path-based gestures can be operated with a single pointer.",
    manualTest: true,
  },
  {
    id: "2.5.2",
    name: "Pointer Cancellation",
    level: "A",
    principle: "Operable",
    summary:
      "Functionality that can be operated using a single pointer can be cancelled before completion.",
    manualTest: true,
  },
  {
    id: "2.5.3",
    name: "Label in Name",
    level: "A",
    principle: "Operable",
    summary:
      "For user interface components with labels that include text or images of text, the name contains the text that is presented visually.",
    manualTest: false,
  },
  {
    id: "2.5.4",
    name: "Motion Actuation",
    level: "A",
    principle: "Operable",
    summary:
      "Functionality that can be operated by device motion or user motion can also be operated by user interface components.",
    manualTest: true,
  },
  {
    id: "2.5.5",
    name: "Target Size (Enhanced)",
    level: "AAA",
    principle: "Operable",
    summary:
      "The size of the target for pointer inputs is at least 44 by 44 CSS pixels.",
    manualTest: false,
  },
  {
    id: "2.5.6",
    name: "Concurrent Input Mechanisms",
    level: "AAA",
    principle: "Operable",
    summary:
      "Web content does not restrict use of input modalities available on a platform.",
    manualTest: true,
  },
  {
    id: "2.5.7",
    name: "Dragging Movements",
    level: "AA",
    principle: "Operable",
    summary:
      "All functionality that uses a dragging movement can be achieved by a single pointer without dragging.",
    manualTest: true,
  },
  {
    id: "2.5.8",
    name: "Target Size (Minimum)",
    level: "AA",
    principle: "Operable",
    summary:
      "The size of the target for pointer inputs is at least 24 by 24 CSS pixels.",
    manualTest: false,
  },
  {
    id: "3.1.1",
    name: "Language of Page",
    level: "A",
    principle: "Understandable",
    summary:
      "The default human language of each web page can be programmatically determined.",
    manualTest: false,
  },
  {
    id: "3.1.2",
    name: "Language of Parts",
    level: "AA",
    principle: "Understandable",
    summary:
      "The human language of each passage or phrase in the content can be programmatically determined.",
    manualTest: false,
  },
  {
    id: "3.1.3",
    name: "Unusual Words",
    level: "AAA",
    principle: "Understandable",
    summary:
      "A mechanism is available for identifying specific definitions of words or phrases used in an unusual way.",
    manualTest: true,
  },
  {
    id: "3.1.4",
    name: "Abbreviations",
    level: "AAA",
    principle: "Understandable",
    summary:
      "A mechanism for identifying the expanded form or meaning of abbreviations is available.",
    manualTest: true,
  },
  {
    id: "3.1.5",
    name: "Reading Level",
    level: "AAA",
    principle: "Understandable",
    summary:
      "When text requires reading ability more advanced than the lower secondary education level, supplemental content is available.",
    manualTest: true,
  },
  {
    id: "3.1.6",
    name: "Pronunciation",
    level: "AAA",
    principle: "Understandable",
    summary:
      "A mechanism is available for identifying specific pronunciation of words where meaning is ambiguous.",
    manualTest: true,
  },
  {
    id: "3.2.1",
    name: "On Focus",
    level: "A",
    principle: "Understandable",
    summary:
      "When any user interface component receives focus, it does not initiate a change of context.",
    manualTest: false,
  },
  {
    id: "3.2.2",
    name: "On Input",
    level: "A",
    principle: "Understandable",
    summary:
      "Changing the setting of any user interface component does not automatically cause a change of context.",
    manualTest: false,
  },
  {
    id: "3.2.3",
    name: "Consistent Navigation",
    level: "AA",
    principle: "Understandable",
    summary:
      "Navigational mechanisms that are repeated on multiple web pages within a set of web pages occur in the same relative order.",
    manualTest: true,
  },
  {
    id: "3.2.4",
    name: "Consistent Identification",
    level: "AA",
    principle: "Understandable",
    summary:
      "Components that have the same functionality within a set of web pages are identified consistently.",
    manualTest: true,
  },
  {
    id: "3.2.5",
    name: "Change on Request",
    level: "AAA",
    principle: "Understandable",
    summary:
      "Changes of context are initiated only by user request or a mechanism is available to turn off such changes.",
    manualTest: true,
  },
  {
    id: "3.2.6",
    name: "Consistent Help",
    level: "A",
    principle: "Understandable",
    summary:
      "If a web page contains any of the following help mechanisms, and those mechanisms are repeated on multiple web pages within a set of web pages, they occur in the same order relative to other page content.",
    manualTest: true,
  },
  {
    id: "3.3.1",
    name: "Error Identification",
    level: "A",
    principle: "Understandable",
    summary:
      "If an input error is detected, the item is identified and the error is described in text.",
    manualTest: false,
  },
  {
    id: "3.3.2",
    name: "Labels or Instructions",
    level: "A",
    principle: "Understandable",
    summary:
      "Labels or instructions are provided when content requires user input.",
    manualTest: false,
  },
  {
    id: "3.3.3",
    name: "Error Suggestion",
    level: "AA",
    principle: "Understandable",
    summary:
      "If an input error is detected and suggestions for correction are known, suggestions are provided.",
    manualTest: false,
  },
  {
    id: "3.3.4",
    name: "Error Prevention (Legal, Financial, Data)",
    level: "AA",
    principle: "Understandable",
    summary:
      "For web pages that cause legal commitments or financial transactions, submissions are reversible, checked, or confirmed.",
    manualTest: true,
  },
  {
    id: "3.3.5",
    name: "Help",
    level: "AAA",
    principle: "Understandable",
    summary:
      "Context-sensitive help is available.",
    manualTest: true,
  },
  {
    id: "3.3.6",
    name: "Error Prevention (All)",
    level: "AAA",
    principle: "Understandable",
    summary:
      "For web pages that require the user to submit information, submissions are reversible, checked, or confirmed.",
    manualTest: true,
  },
  {
    id: "3.3.7",
    name: "Accessible Authentication",
    level: "A",
    principle: "Understandable",
    summary:
      "A cognitive function test is not required for any step in an authentication process unless an alternative is provided.",
    manualTest: true,
  },
  {
    id: "3.3.8",
    name: "Accessible Authentication (Minimum)",
    level: "AA",
    principle: "Understandable",
    summary:
      "A cognitive function test is not required for any step in an authentication process unless an alternative is provided.",
    manualTest: false,
  },
  {
    id: "3.3.9",
    name: "Accessible Authentication (Enhanced)",
    level: "AAA",
    principle: "Understandable",
    summary:
      "A cognitive function test is not required for any step in an authentication process.",
    manualTest: true,
  },
  {
    id: "4.1.2",
    name: "Name, Role, Value",
    level: "A",
    principle: "Robust",
    summary:
      "For all user interface components, the name and role can be programmatically determined; states, properties, and values can be set by the user.",
    manualTest: false,
  },
  {
    id: "4.1.3",
    name: "Status Messages",
    level: "AA",
    principle: "Robust",
    summary:
      "In content implemented using markup languages, status messages can be programmatically determined through role or properties.",
    manualTest: false,
  },
];

export const NEW_IN_22 = [
  "2.4.11",
  "2.4.12",
  "2.4.13",
  "2.5.7",
  "2.5.8",
  "3.2.6",
  "3.3.7",
  "3.3.8",
  "3.3.9",
];
