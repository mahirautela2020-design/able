import type { Page } from "playwright-core";

export interface Announcement {
  text: string;
  timestamp: number;
  source: string;
}

export async function captureLiveAnnouncements(
  page: Page
): Promise<Announcement[]> {
  const announcements: Announcement[] = [];

  await page.evaluate(() => {
    interface ScanA11yWindow extends Window {
      __ableAnnouncements: Announcement[];
      __ableAnnounced: Set<string>;
      __ableObs: MutationObserver;
    }
    const win = window as unknown as ScanA11yWindow;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" || mutation.type === "characterData") {
          const target = mutation.target as Element;
          const live = target.closest?.("[aria-live], [role='status'], [role='alert']");
          if (live) {
            const text = live.textContent?.trim();
            if (text && !win.__ableAnnounced?.has(text)) {
              if (!win.__ableAnnounced) {
                win.__ableAnnounced = new Set<string>();
              }
              win.__ableAnnounced.add(text);
              win.__ableAnnouncements.push({
                text,
                timestamp: Date.now(),
                source: live.getAttribute("role") || live.getAttribute("aria-live") || "unknown",
              });
            }
          }
        }
      }
    });

    win.__ableAnnouncements = [];
    win.__ableAnnounced = new Set<string>();

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-live"],
    });

    win.__ableObs = observer;
  });

  const captured = await page.evaluate(() => {
    interface ScanA11yWindow extends Window {
      __ableAnnouncements: Announcement[];
      __ableObs: MutationObserver;
    }
    const win = window as unknown as ScanA11yWindow;
    win.__ableObs?.disconnect();
    return win.__ableAnnouncements || [];
  });

  announcements.push(...captured);

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

  for (const lr of liveRegions) {
    if (!announcements.some((a) => a.text === lr.text)) {
      announcements.push({
        text: lr.text,
        timestamp: Date.now(),
        source: lr.source,
      });
    }
  }

  return announcements;
}
