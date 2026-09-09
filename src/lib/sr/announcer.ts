import type { Page } from "playwright-core";

export interface Announcement {
  text: string;
  /** When THIS capture ran — not when a screen reader would have spoken the
   * text. `detected` says which of those two this actually is. */
  timestamp: number;
  source: string;
  detected: "static" | "observed";
}

/**
 * Record what a screen reader would announce from the page's live regions.
 *
 * This used to install a MutationObserver and read it back on the very next
 * CDP round-trip. Measured across every target: it captured zero mutations,
 * and still zero when given a 4-second window — because by the time this runs
 * the audit has already finished interacting with the page, so there is
 * nothing left to mutate. Every value it ever returned came from the static
 * sweep below, wearing an `observed`-looking timestamp it had not earned.
 *
 * So the observer is gone and the remaining sweep is labelled honestly. It
 * reports live-region CONTENT PRESENT AT SCAN TIME, which is a real and useful
 * signal (an `aria-live` region holding stale text is a genuine defect) — it
 * is just not a recording of announcements over time. Capturing those needs
 * the observer installed BEFORE the interaction phase, which is a change to
 * the scan's shape, not to this function.
 */
export async function captureLiveAnnouncements(
  page: Page
): Promise<Announcement[]> {
  const capturedAt = Date.now();

  const liveRegions = await page.evaluate(() => {
    const regions = document.querySelectorAll(
      "[aria-live], [role='status'], [role='alert']"
    );
    const result: Array<{ text: string; source: string }> = [];
    for (const r of regions) {
      const text = r.textContent?.trim();
      if (text) {
        result.push({
          text,
          source: r.getAttribute("role") || r.getAttribute("aria-live") || "unknown",
        });
      }
    }
    return result;
  });

  const announcements: Announcement[] = [];
  for (const lr of liveRegions) {
    if (!announcements.some((a) => a.text === lr.text)) {
      announcements.push({
        text: lr.text,
        timestamp: capturedAt,
        source: lr.source,
        detected: "static",
      });
    }
  }

  return announcements;
}
