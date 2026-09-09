import { getFigmaPat } from "@/lib/env.server";

const FIGMA_API = "https://api.figma.com/v1";
const FIGMA_HOST = "api.figma.com";
const FILE_KEY_RE = /^[A-Za-z0-9]+$/;

/**
 * Ceiling on the raw JSON we will buffer for one file. A large design-system
 * file serializes to tens of MB; past this the serverless function runs out of
 * memory before the parser ever sees the document.
 */
export const MAX_FILE_BYTES = 40 * 1024 * 1024;

/**
 * Depth used ONLY by the fallback fetch for a file over MAX_FILE_BYTES.
 * Figma's `depth` cuts the tree that many levels down, which on a real
 * 38,794-node file returns under 3% of the TEXT and fill-bearing nodes — so it
 * can never be the default: auditing 3% of a file yields near-zero findings
 * and reads to the user as "your file is clean". When size forces us into it,
 * the result carries `truncated: true` so the caller can say so out loud.
 */
const TRUNCATION_FALLBACK_DEPTH = 4;

export interface FigmaFileResponse {
  document: unknown;
  name: string;
  lastModified: string;
  thumbnailUrl?: string;
  version?: string;
}

export interface FigmaFileResult extends FigmaFileResponse {
  /** True when only the top TRUNCATION_FALLBACK_DEPTH levels were fetched
   * because the full tree exceeded MAX_FILE_BYTES. Findings are incomplete. */
  truncated: boolean;
}

interface FigmaNodeResponse {
  nodes: Record<string, { document: unknown }>;
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
      // /design|file|proto|board|slides|deck/<key>/... — every Figma product
      // path, not just the three design ones. The (?=\/|$) anchors the capture
      // to a whole path segment: without it `([A-Za-z0-9]+)` happily matches a
      // *prefix*, so a segment carrying any other character yields a silently
      // truncated key that 404s against the wrong file.
      const match = parsed.pathname.match(
        /\/(?:design|file|proto|board|slides|deck)\/([A-Za-z0-9]+)(?=\/|$)/
      );
      if (match) return match[1];
    }
  } catch {
    // not a URL — fall through
  }
  return null;
}

/**
 * Figma share URLs carry node ids dash-separated ("node-id=1953-9007") while
 * the REST API takes and keys them colon-separated ("1953:9007"). Normalizing
 * makes a copy-pasted URL id work; an id that already uses colons is a no-op.
 */
function normalizeNodeId(nodeId: string): string {
  return nodeId.replace(/-/g, ":");
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
 * Figma enforces the pairing between token form and header: a personal access
 * token (`figd_` prefix) must travel in X-Figma-Token, an OAuth2 access token
 * in `Authorization: Bearer`. Mismatching them is a hard 401 — a PAT sent as
 * Bearer comes back "figd_ tokens must be passed via X-Figma-Token header,
 * not Authorization".
 */
function authHeaders(token: string): Record<string, string> {
  return token.startsWith("figd_")
    ? { "X-Figma-Token": token }
    : { Authorization: `Bearer ${token}` };
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

  return fetch(url, { headers: authHeaders(token) });
}

/**
 * Buffer a response body, refusing to hold more than MAX_FILE_BYTES. Returns
 * null when the body is over the cap so the caller can fall back to a bounded
 * fetch instead of OOMing. `content-length` is checked first because it lets
 * us bail before buffering at all; the buffered length is the backstop for
 * chunked or compressed responses whose header understates the payload.
 */
async function readBounded(resp: Response): Promise<string | null> {
  const declared = Number(resp.headers.get("content-length"));
  if (declared > MAX_FILE_BYTES) return null;
  const text = await resp.text();
  return text.length > MAX_FILE_BYTES ? null : text;
}

export async function getFile(
  fileKey: string,
  tokenOverride?: string | null
): Promise<FigmaFileResult> {
  validateFileKey(fileKey);

  // Deliberately no `depth`: the audit lives on the leaves (TEXT nodes, fills),
  // and a depth cap drops them while still returning a well-formed file — the
  // failure mode is a confident empty report, not an error.
  const resp = await fetchFigma(`/files/${fileKey}`, tokenOverride);
  if (!resp.ok) {
    throw new Error(`Figma API error (${resp.status}): ${await resp.text()}`);
  }

  const body = await readBounded(resp);
  if (body !== null) {
    return { ...(JSON.parse(body) as FigmaFileResponse), truncated: false };
  }

  // Over the cap. Refetch a bounded slice so the audit returns something, and
  // flag it: a partial audit presented as complete is worse than no audit.
  const capped = await fetchFigma(
    `/files/${fileKey}?depth=${TRUNCATION_FALLBACK_DEPTH}`,
    tokenOverride
  );
  if (!capped.ok) {
    throw new Error(`Figma API error (${capped.status}): ${await capped.text()}`);
  }
  return { ...((await capped.json()) as FigmaFileResponse), truncated: true };
}

export async function getNode(
  fileKey: string,
  nodeId: string,
  tokenOverride?: string | null
): Promise<FigmaNodeResponse["nodes"][string] | null> {
  validateFileKey(fileKey);
  const id = normalizeNodeId(nodeId);
  const resp = await fetchFigma(
    `/files/${fileKey}/nodes?ids=${encodeURIComponent(id)}`,
    tokenOverride
  );
  if (!resp.ok) {
    throw new Error(`Figma API error (${resp.status}): ${await resp.text()}`);
  }
  const data = (await resp.json()) as FigmaNodeResponse;
  // Keyed by the colon form the API echoes back, not by whatever the caller
  // pasted in.
  return data.nodes[id] ?? null;
}
