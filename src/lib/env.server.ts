/**
 * Centralized server-side environment variable access.
 * Never import this in client components — Next.js tree-shakes server-only code,
 * but explicit gating prevents accidental client leaks.
 */
export function getFigmaPat(): string | null {
  return process.env.FIGMA_PAT ?? process.env.FIGMA_ACCESS_TOKEN ?? null;
}

export function isFigmaAuditPublic(): boolean {
  return process.env.FIGMA_AUDIT_PUBLIC === "true";
}
