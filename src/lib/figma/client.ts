import { getFigmaPat } from "@/lib/env.server";

const FIGMA_API = "https://api.figma.com/v1";
const FIGMA_HOST = "api.figma.com";
const FILE_KEY_RE = /^[A-Za-z0-9]+$/;

interface FigmaFileResponse {
  document: unknown;
  name: string;
  lastModified: string;
  thumbnailUrl?: string;
  version?: string;
}

interface FigmaNodeResponse {
  nodes: Record<string, { document: unknown }>;
}

interface FigmaImagesResponse {
  images: Record<string, string | null>;
}

function validateFileKey(key: string): void {
  if (!FILE_KEY_RE.test(key)) {
    throw new Error(`Invalid file key: ${key}`);
  }
}

/**
 * Accept either a raw file key ("abc123DEF") or a full Figma share URL
 * ("https://www.figma.com/design/abc123DEF/My-Design") — extracts the key.
 * Returns null when neither matches.
 */
export function extractFileKey(input: string): string | null {
  const trimmed = input.trim();
  if (FILE_KEY_RE.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === "www.figma.com" || parsed.hostname === "figma.com") {
      // /design/<key>/...  |  /file/<key>/...  |  /proto/<key>/...
      const match = parsed.pathname.match(/\/(?:design|file|proto)\/([A-Za-z0-9]+)/);
      if (match) return match[1];
    }
  } catch {
    // not a URL — fall through
  }
  return null;
}

function validateUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`SSRF guard: only HTTPS allowed, got ${parsed.protocol}`);
  }
  if (parsed.hostname !== FIGMA_HOST) {
    throw new Error(`SSRF guard: host must be ${FIGMA_HOST}, got ${parsed.hostname}`);
  }
}

/**
 * Fetch from the Figma REST API.
 * @param tokenOverride — per-user OAuth token (from figma_connections).
 *   Falls back to the global PAT (single-account mode) when absent.
 */
async function fetchFigma(path: string, tokenOverride?: string | null): Promise<Response> {
  const token = tokenOverride ?? getFigmaPat();
  if (!token) {
    throw new Error("FIGMA_PAT not configured");
  }

  const url = `${FIGMA_API}${path}`;
  validateUrl(url);

  return fetch(url, {
    headers: {
      "X-Figma-Token": token,
    },
  });
}

export async function getFile(
  fileKey: string,
  tokenOverride?: string | null
): Promise<FigmaFileResponse> {
  validateFileKey(fileKey);
  const resp = await fetchFigma(`/files/${fileKey}?depth=4`, tokenOverride);
  if (!resp.ok) {
    throw new Error(`Figma API error (${resp.status}): ${await resp.text()}`);
  }
  return resp.json() as Promise<FigmaFileResponse>;
}

export async function getNode(
  fileKey: string,
  nodeId: string,
  tokenOverride?: string | null
): Promise<FigmaNodeResponse["nodes"][string] | null> {
  validateFileKey(fileKey);
  const resp = await fetchFigma(
    `/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
    tokenOverride
  );
  if (!resp.ok) {
    throw new Error(`Figma API error (${resp.status}): ${await resp.text()}`);
  }
  const data = (await resp.json()) as FigmaNodeResponse;
  return data.nodes[nodeId] ?? null;
}

export async function getImages(
  fileKey: string,
  ids: string[]
): Promise<Record<string, string | null>> {
  validateFileKey(fileKey);
  const resp = await fetchFigma(
    `/images/${fileKey}?ids=${encodeURIComponent(ids.join(","))}&format=png`
  );
  if (!resp.ok) {
    throw new Error(`Figma API error (${resp.status}): ${await resp.text()}`);
  }
  const data = (await resp.json()) as FigmaImagesResponse;
  return data.images;
}

export async function getFileNodes(fileKey: string): Promise<unknown> {
  validateFileKey(fileKey);
  const resp = await fetchFigma(`/files/${fileKey}/nodes`);
  if (!resp.ok) {
    throw new Error(`Figma API error (${resp.status}): ${await resp.text()}`);
  }
  return resp.json();
}
