/**
 * Every call from the side panel to the real page goes through here: get
 * the active tab, make sure content-script.js is injected (idempotent --
 * the script itself no-ops on a second injection, see __ableExtLoaded),
 * then relay a chrome.runtime message and return its response.
 *
 * Deliberately does NOT pre-check tab.url against an http(s) pattern --
 * chrome.tabs.query() only reliably includes `url` when the extension's
 * activeTab grant currently covers that exact tab, and because a side
 * panel stays open across tab switches/navigation (unlike a popup), that
 * grant doesn't consistently apply to whatever tab happens to be active
 * when a button is clicked. That made every real http(s) page look like a
 * "browser-internal page" whenever url came back empty. Attempting the
 * injection and catching Chrome's own error is the authoritative check --
 * it only fails for pages that actually can't be scripted.
 */

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  return tab;
}

async function getActiveTabId(): Promise<number> {
  return (await getActiveTab()).id!;
}

function friendlyInjectionError(e: unknown): Error {
  const message = e instanceof Error ? e.message : String(e);
  if (/cannot access|extension gallery|chrome:\/\/|chrome-extension:\/\/|edge:\/\//i.test(message)) {
    return new Error("Open a regular website first (not a browser-internal page like chrome:// or the extensions gallery).");
  }
  return e instanceof Error ? e : new Error(message);
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["dist/content-script.js"] });
  } catch (e) {
    throw friendlyInjectionError(e);
  }
}

export async function callTab<T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const tabId = await getActiveTabId();
  await ensureContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, { type, ...payload }) as Promise<T>;
}

export async function ensureAxeLoaded(): Promise<number> {
  const tabId = await getActiveTabId();
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["vendor/axe.min.js"] });
  } catch (e) {
    throw friendlyInjectionError(e);
  }
  await ensureContentScript(tabId);
  return tabId;
}

export async function runAxeOnTab(): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const tabId = await ensureAxeLoaded();
  return chrome.tabs.sendMessage(tabId, { type: "run-axe" });
}

/** PNG data URL of the active tab's currently-visible viewport -- used to
 * build the PDF report's per-finding evidence images. Requires host access
 * to the tab's origin (covered by manifest.json's http(s) host_permissions,
 * no separate "tabs"/"<all_urls>" grant needed). Only captures what's
 * currently in the viewport, so callers must scroll/highlight the target
 * element into view first (see AuditTab's downloadPdf). */
export async function captureVisibleTab(): Promise<string> {
  const tab = await getActiveTab();
  if (tab.windowId === undefined) throw new Error("No active window");
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
}
