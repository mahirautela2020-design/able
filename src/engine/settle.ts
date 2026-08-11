import type { Page } from "playwright-core";

export async function dismissConsentIfPresent(page: Page): Promise<boolean> {
  try {
    const dismissed = await page.evaluate(() => {
      const selectors = [
        "#onetrust-accept-btn-handler",
        'button[aria-label*="ccept" i]',
        'button[aria-label*="gree" i]',
        'a[aria-label*="ccept" i]',
        "#cookie-consent-accept",
        ".cookie-accept",
        ".cc-accept",
        '[data-testid="cookie-consent-accept"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el && (el.offsetParent !== null || el.getClientRects().length > 0)) {
          el.click();
          return true;
        }
      }
      return false;
    });
    if (dismissed) {
      await page.waitForTimeout(1500);
    }
    return dismissed;
  } catch {
    return false;
  }
}

export async function waitForPageSettle(
  page: Page,
  telemetry: { networkidleTimedOut: boolean }
): Promise<void> {
  const hasRoot = await page
    .evaluate(
      () => !!document.querySelector("#root, #__next, #app, app-root")
    )
    .catch(() => false);

  if (hasRoot) {
    await page
      .waitForSelector(
        "#root > *, #__next > *, #app > *, app-root > *",
        { timeout: 8_000 }
      )
      .catch(() => {});
  }

  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation-play-state:paused!important;transition:none!important}",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });

  await dismissConsentIfPresent(page);

  try {
    await page.waitForLoadState("networkidle", { timeout: 8_000 });
  } catch {
    telemetry.networkidleTimedOut = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
  await page.waitForTimeout(1_000);
}
