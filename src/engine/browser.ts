import chromium from "@sparticuz/chromium";
import { type Browser, type Page, chromium as playwrightChromium } from "playwright-core";

const USER_AGENT = "ScanA11yAuditor/0.1 (+https://scana11y.vercel.app)";

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
  });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await context.close().catch(() => {});
  }
}

export async function takeScreenshot(
  page: Page
): Promise<Buffer> {
  return page.screenshot({
    fullPage: true,
    animations: "disabled",
    clip: { x: 0, y: 0, width: 1440, height: 20_000 },
  });
}
