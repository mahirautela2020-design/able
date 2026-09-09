import chromium from "@sparticuz/chromium";
import { type Browser, type Page, chromium as playwrightChromium } from "playwright-core";

const USER_AGENT = "ScanA11yAuditor/0.1 (+https://scana11y.vercel.app)";

/** Chromium composites a full-page capture through a single GPU texture whose
 * hard limit is 16384px. Past that row the capture does NOT go blank — it
 * silently WRAPS AROUND and repeats the top of the page, so a finding at
 * y=18313 crops to plausible-looking content from the first screenful. That
 * is fabricated evidence a human reviewer cannot distinguish from the real
 * thing, which is exactly what this project's guardrails forbid.
 *
 * WebP's own dimension limit is one pixel lower (16383) — above it sharp
 * throws "Processed image is too large for the WebP format", which used to
 * be swallowed by a bare catch in audit-url.ts, losing the screenshot
 * entirely on any tall page.
 *
 * Capturing at most this many pixels satisfies both limits. Anything below
 * the cut is reported via `truncated`/`documentHeight` so the caller can skip
 * out-of-range crops instead of inventing them. */
export const MAX_CAPTURE_PX = 16_383;

let cachedBrowser: Browser | null = null;

export async function launchBrowser(): Promise<Browser> {
  if (cachedBrowser?.isConnected()) return cachedBrowser;

  const isVercel = !!process.env.VERCEL;

  const browser = await playwrightChromium.launch({
    ...(isVercel
      ? {
          args: [
            ...chromium.args,
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
          ],
          executablePath: await chromium.executablePath(),
          headless: true,
        }
      : {
          executablePath: process.env.CHROME_EXECUTABLE_PATH,
          headless: true,
        }),
  });

  cachedBrowser = browser;
  browser.on("disconnected", () => {
    cachedBrowser = null;
  });
  return browser;
}

export interface WithPageOptions {
  viewport?: { width: number; height: number };
}

export async function withPage<T>(
  fn: (page: Page) => Promise<T>,
  options: WithPageOptions = {}
): Promise<T> {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1440, height: 900 },
    userAgent: USER_AGENT,
    // axe-core is injected as an inline <script> (see axe-scan.ts). Sites
    // with a strict script-src CSP — github.com among them — reject that
    // injection, the rejection escapes the per-page scan, and Inngest then
    // fails the WHOLE audit (no report, even for pages already scanned).
    // bypassCSP applies only to our own injected scripts; it does not change
    // what the page itself is allowed to load, so it cannot alter findings.
    bypassCSP: true,
  });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await context.close().catch(() => {});
  }
}

export interface ScreenshotResult {
  buffer: Buffer;
  /** Pixel dimensions of `buffer` — the authoritative bounds for cropping. */
  width: number;
  height: number;
  /** Full document height in CSS px, even when larger than `height`. */
  documentHeight: number;
  /** True when the document was taller/wider than MAX_CAPTURE_PX. */
  truncated: boolean;
}

export async function takeScreenshot(page: Page): Promise<ScreenshotResult> {
  // Measure the document first so the clip can be capped at a size Chromium
  // can actually render. Falling back to the viewport keeps this working on
  // pages where document/body are unavailable (about:blank, early aborts).
  const doc = await page
    .evaluate(() => {
      const el = document.documentElement;
      const body = document.body;
      if (!el) return null;
      return {
        width: Math.max(
          el.scrollWidth,
          el.clientWidth,
          body?.scrollWidth ?? 0,
          window.innerWidth
        ),
        height: Math.max(
          el.scrollHeight,
          el.clientHeight,
          body?.scrollHeight ?? 0,
          window.innerHeight
        ),
      };
    })
    .catch(() => null);

  const documentWidth = doc?.width ?? 1440;
  const documentHeight = doc?.height ?? 900;
  const width = Math.min(documentWidth, MAX_CAPTURE_PX);
  const height = Math.min(documentHeight, MAX_CAPTURE_PX);

  const buffer = await page.screenshot({
    fullPage: true,
    animations: "disabled",
    clip: { x: 0, y: 0, width, height },
  });

  return {
    buffer,
    width,
    height,
    documentHeight,
    truncated: documentHeight > height || documentWidth > width,
  };
}
