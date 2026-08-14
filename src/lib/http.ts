/** Best-effort client IP from Vercel/Next headers — shared by every route
 * that scopes anonymous access by request IP (audits list/delete, report,
 * sr-preview, contrast-finding). */
export function getClientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? null;
}
