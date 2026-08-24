/** Figma's plugin UI <-> main-thread channel is a single postMessage pipe
 * with no built-in request/response pairing -- callPlugin() adds a
 * correlation id per call so concurrent calls resolve to the right
 * promise, the same problem the Chrome extension's tab-bridge.ts doesn't
 * have (chrome.tabs.sendMessage already returns a promise per call). */

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

const pending = new Map<string, PendingEntry>();
let nextId = 0;

window.onmessage = (event: MessageEvent) => {
  const msg = event.data?.pluginMessage as { id?: string; ok?: boolean; result?: unknown; error?: string } | undefined;
  if (!msg || typeof msg.id !== "string") return;
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  if (msg.ok) {
    entry.resolve(msg.result);
  } else {
    entry.reject(new Error(msg.error || "Plugin call failed"));
  }
};

export function callPlugin<T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const id = String(nextId++);
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    parent.postMessage({ pluginMessage: { type, id, ...payload } }, "*");
  });
}
