/**
 * Every call from the side panel to the real page goes through here: get
 * the active tab, make sure content-script.js is injected (idempotent --
 * the script itself no-ops on a second injection, see __ableExtLoaded),
 * then relay a chrome.runtime message and return its response.
 */

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  if (!/^https?:/.test(tab.url || "")) {
    throw new Error("Open a regular http(s) page first (not a browser-internal page).");
  }
  return tab.id;
}

async function ensureContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["dist/content-script.js"] });
}

export async function callTab<T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const tabId = await getActiveTabId();
  await ensureContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, { type, ...payload }) as Promise<T>;
}

export async function ensureAxeLoaded(): Promise<number> {
  const tabId = await getActiveTabId();
  await chrome.scripting.executeScript({ target: { tabId }, files: ["vendor/axe.min.js"] });
  await ensureContentScript(tabId);
  return tabId;
}

export async function runAxeOnTab(): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const tabId = await ensureAxeLoaded();
  return chrome.tabs.sendMessage(tabId, { type: "run-axe" });
}
