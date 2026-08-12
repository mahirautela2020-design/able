import { existsSync } from "node:fs";
import net from "node:net";
import type { NvdaAvailability } from "./nvda-types";

/**
 * NVDA ControllerClient named-pipe driver (Windows-only).
 *
 * NVDA exposes a named pipe at `\\.\pipe\nvdaControllerClient` through which an
 * external process can drive speech (and braille/key injection) without loading
 * into NVDA's process. This driver is intentionally defensive:
 *
 *  - Every call carries a 3 s timeout so a hung/absent NVDA can never block an
 *    audit (P7 §46).
 *  - Every surface degrades to `{ available: false }` / `{ ok: false }` rather
 *    than throwing (P7 §44-45, RISKS §1-3).
 *  - The pipe protocol is a best-effort reconstruction of NVDA's controller
 *    client (a version-varying, undocumented-in-package surface — RISKS §4).
 *    When NVDA is absent the code path is never exercised, so failures are
 *    non-fatal by construction.
 */

const NVDA_PIPE = "\\\\.\\pipe\\nvdaControllerClient";

/** Message types from NVDA's controller client (`extras/controllerClient`). */
const MSG_SPEAK = 0;
const MSG_BRAILLE = 1;

/** Default install locations checked when `NVDA_PATH` is unset. */
const DEFAULT_INSTALL_PATHS = [
  "C:\\Program Files (x86)\\NVDA\\nvda.exe",
  "C:\\Program Files\\NVDA\\nvda.exe",
];

/** Feature-detect a local NVDA install. Never throws. */
export function detectNvda(): NvdaAvailability {
  if (process.platform !== "win32") {
    return { available: false, path: null, reason: "non-windows" };
  }

  const envPath = process.env.NVDA_PATH;
  if (envPath && existsSync(/* turbopackIgnore: true */ envPath)) {
    return { available: true, path: envPath, reason: null };
  }

  for (const p of DEFAULT_INSTALL_PATHS) {
    if (existsSync(/* turbopackIgnore: true */ p)) {
      return { available: true, path: p, reason: null };
    }
  }

  return { available: false, path: null, reason: "nvda-not-found" };
}

export interface NvdaSpeakResult {
  ok: boolean;
  error?: string;
}

/**
 * A handle to a local NVDA controller client connection.
 * Construct with the result of `detectNvda()`; all methods are safe to call
 * even when NVDA is unavailable.
 */
export class NvdaDriver {
  private socket: net.Socket | null = null;
  /** The last text we asked NVDA to speak (best-effort "capture"). */
  private lastSpoken: string | null = null;
  readonly available: boolean;
  readonly path: string | null;

  constructor(path: string | null) {
    this.path = path;
    this.available = process.platform === "win32" && path !== null;
  }

  /** Open the named pipe. Resolves true on connect, false on any failure/timeout. */
  async connect(timeoutMs = 3000): Promise<boolean> {
    if (!this.available) return false;
    if (this.socket && !this.socket.destroyed) return true;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      const socket = net.createConnection(NVDA_PIPE);
      const timer = setTimeout(() => {
        socket.destroy();
        done(false);
      }, timeoutMs);

      socket.once("connect", () => {
        clearTimeout(timer);
        this.socket = socket;
        done(true);
      });
      socket.once("error", () => {
        clearTimeout(timer);
        socket.destroy();
        done(false);
      });
    });
  }

  /**
   * Ask NVDA to speak `text`. Records it as the last-spoken text so downstream
   * capture has *something* deterministic to compare (NVDA does not expose a
   * reliable read-back of its actual audio output — RISKS §4).
   */
  async speak(text: string, timeoutMs = 3000): Promise<NvdaSpeakResult> {
    if (!this.available) {
      return { ok: false, error: "nvda-unavailable" };
    }

    const connected = await this.connect(timeoutMs);
    if (!connected || !this.socket) {
      return { ok: false, error: "nvda-connect-failed" };
    }

    const payload = encodeMessage(MSG_SPEAK, text);
    this.lastSpoken = text;

    return new Promise<NvdaSpeakResult>((resolve) => {
      let settled = false;
      const done = (result: NvdaSpeakResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const timer = setTimeout(() => {
        this.socket?.destroy();
        this.socket = null;
        done({ ok: false, error: "nvda-timeout" });
      }, timeoutMs);

      this.socket!.once("error", (err) => {
        clearTimeout(timer);
        done({ ok: false, error: err.message });
      });

      this.socket!.write(payload, (err) => {
        clearTimeout(timer);
        if (err) {
          done({ ok: false, error: err.message });
        } else {
          done({ ok: true });
        }
      });
    });
  }

  /**
   * Best-effort "spoken text" capture. NVDA's pipe protocol has no reliable
   * get-spoken-text API, so we return the last text we requested — the closest
   * deterministic proxy available without audio capture (RISKS §4).
   */
  getSpokenText(): string | null {
    return this.lastSpoken;
  }

  /** Close the pipe. Idempotent; never throws. */
  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}

/**
 * Encode a controller-client request frame:
 *   [uint32 LE message type][uint32 LE data byte length][data bytes]
 * Data is UTF-16LE per NVDA's controller client (`client.py` encodes via
 * `text.encode("utf-16-le")`). Best-effort reconstruction — see header note.
 */
function encodeMessage(messageType: number, text: string): Buffer {
  const data = Buffer.from(text, "utf16le");
  const header = Buffer.alloc(8);
  header.writeUInt32LE(messageType, 0);
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data]);
}

/** Exported for tests: a no-op braille frame so callers can shape future work. */
export const NVDA_MESSAGE = {
  SPEAK: MSG_SPEAK,
  BRAILLE: MSG_BRAILLE,
} as const;
