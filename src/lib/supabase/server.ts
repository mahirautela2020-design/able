import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  _supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _supabase;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getSupabase() as any)[prop];
  },
});

type AuditRow = {
  id: string;
  target_url: string;
  status: string;
  config: Record<string, unknown>;
  progress: Record<string, unknown>;
  report_path: string | null;
  error_code: string | null;
  error_detail: string | null;
  created_at: string;
  completed_at: string | null;
};

type AuditPageRow = {
  id: string;
  audit_id: string;
  page_url: string;
  page_title: string | null;
  status: string;
  wcag_score: number | null;
  axe_version: string | null;
  consent_dismissed: boolean | null;
  settled_at_ms: number | null;
  networkidle_timed_out: boolean | null;
  error_code: string | null;
  evidence: Record<string, unknown>;
  scanned_at: string | null;
};

type FindingRow = {
  id?: string;
  audit_id: string;
  page_id: string;
  bucket: string;
  rule_id: string;
  rule_title: string;
  wcag_criteria: string[];
  wcag_criterion: string | null;
  wcag_level: string | null;
  principle: string | null;
  severity: string;
  confidence: number;
  source_engines: string[];
  selector: string | null;
  element_html: string | null;
  failure_summary: string;
  additional_instances: number;
  screenshot_crop_url: string | null;
  full_screenshot_url: string | null;
  recommendation: string | null;
  evidence: Record<string, unknown>;
  engine_version: string | null;
};

export async function insertAudit(
  targetUrl: string,
  config: Record<string, unknown> = {},
  owner?: { userId: string | null; ip: string | null }
): Promise<string> {
  const { data, error } = await supabase
    .from("audits")
    .insert({
      target_url: targetUrl,
      config,
      created_by: owner?.userId ?? null,
      created_ip: owner?.ip ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function getAudit(auditId: string) {
  const { data, error } = await supabase
    .from("audits")
    .select(
      "id, target_url, status, config, progress, fast_preview, report_path, error_code, error_detail, created_at, completed_at, created_by, created_ip"
    )
    .eq("id", auditId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateAuditStatus(
  auditId: string,
  status: string,
  updates: Partial<AuditRow> = {}
) {
  const { error } = await supabase
    .from("audits")
    .update({ status, ...updates })
    .eq("id", auditId);

  if (error) throw error;
}

export async function updateAuditProgress(
  auditId: string,
  progress: Record<string, unknown>
) {
  const { error } = await supabase
    .from("audits")
    .update({ progress })
    .eq("id", auditId);

  if (error) throw error;
}

/** Separate column from `progress` (see 0005_fast_preview.sql) -- the PSI
 * preview function runs concurrently with the main audit-url pipeline, and
 * `progress` writes are a full-column replace, so sharing it would race. */
export async function updateAuditFastPreview(
  auditId: string,
  fastPreview: Record<string, unknown>
) {
  const { error } = await supabase
    .from("audits")
    .update({ fast_preview: fastPreview })
    .eq("id", auditId);

  if (error) throw error;
}

export async function insertAuditPage(
  pageRow: Omit<AuditPageRow, "id">
): Promise<string> {
  const { data, error } = await supabase
    .from("audit_pages")
    .insert(pageRow)
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function deleteFindingsForPage(pageId: string) {
  const { error } = await supabase
    .from("findings")
    .delete()
    .eq("page_id", pageId);

  if (error) throw error;
}

export async function insertFindings(
  findings: Omit<FindingRow, "id">[]
) {
  if (findings.length === 0) return;

  const { error } = await supabase
    .from("findings")
    .insert(findings);

  if (error) throw error;
}

/**
 * Resolve the audit_pages row id for a given audit + page URL — used by the
 * Contrast Lab finding route, which only knows the page URL the Explore
 * panel is showing, not the DB page id. Falls back to the audit's first
 * scanned page when no exact URL match exists (still lets a manual flag
 * attach to *some* page rather than failing outright).
 */
/** Loosely normalize a URL for cross-scan matching: scheme (http/https) and
 * a leading "www." are both common redirect artifacts between when a page
 * was crawled and when Contrast Lab re-navigates to it later, so neither
 * should cause an otherwise-identical page to be treated as unmatched. */
function normalizeUrlForMatch(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/$/, "");
    return `${host}${path}${url.search}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export async function getAuditPageId(
  auditId: string,
  pageUrl?: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("audit_pages")
    .select("id, page_url")
    .eq("audit_id", auditId)
    .order("scanned_at", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return null;

  if (pageUrl) {
    const exact = data.find((p) => p.page_url === pageUrl);
    if (exact) return exact.id;

    const normalizedTarget = normalizeUrlForMatch(pageUrl);
    const loose = data.find((p) => normalizeUrlForMatch(p.page_url) === normalizedTarget);
    if (loose) return loose.id;
  }
  return data[0].id;
}

export async function getFindingsForAudit(auditId: string) {
  const { data, error } = await supabase
    .from("findings")
    .select("*")
    .eq("audit_id", auditId);

  if (error) throw error;
  return data;
}

export async function getRecentAudits(
  limit = 10,
  scope?: { userId: string | null; ip: string | null }
) {
  let query = supabase
    .from("audits")
    .select("id, target_url, status, created_at, progress")
    .order("created_at", { ascending: false })
    .limit(limit);

  // Isolation: users only see their own audits (by owner id). Anonymous
  // rows (created_by null, e.g. pre-isolation or unauthenticated) are
  // visible only when the requester's IP matches the recorded creator IP.
  if (scope?.userId) {
    query = query.or(`created_by.eq.${scope.userId},and(created_by.is.null,created_ip.eq.${scope.ip ?? ""})`);
  } else if (scope?.ip) {
    query = query.or(`created_ip.eq.${scope.ip},and(created_by.is.null,created_ip.eq.${scope.ip})`);
  } else {
    query = query.eq("created_by", "00000000-0000-0000-0000-000000000000");
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

/**
 * Count audits created by an IP within the last `hours` (default 24).
 * Used to enforce the anonymous free tier: 5 audits/day per IP, then
 * the user is prompted to create an account.
 */
export async function countAuditsByIp(
  ip: string,
  hours = 24
): Promise<number> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { count, error } = await supabase
    .from("audits")
    .select("id", { count: "exact", head: true })
    .eq("created_ip", ip)
    .gt("created_at", since);

  if (error) throw error;
  return count ?? 0;
}

/**
 * TTL cleanup — called by the retention cron (Inngest):
 *  - audits older than AUDIT_RETENTION_HOURS (default 24) are deleted
 *    (findings/pages cascade; evidence storage removed per audit)
 *  - figma_connections not refreshed within FIGMA_TOKEN_TTL_HOURS
 *    (default 24) are deleted — a user's Figma authorization expires
 *    automatically, so an authorized token can never live forever.
 * Returns a summary of what was cleaned.
 */
export async function cleanupExpiredData(): Promise<{
  auditsDeleted: number;
  connectionsDeleted: number;
}> {
  const retentionHours = parseInt(process.env.AUDIT_RETENTION_HOURS || "24", 10);
  const tokenTtlHours = parseInt(process.env.FIGMA_TOKEN_TTL_HOURS || "24", 10);

  const cutoff = new Date(Date.now() - retentionHours * 3600_000).toISOString();
  const tokenCutoff = new Date(Date.now() - tokenTtlHours * 3600_000).toISOString();

  // 1. Expired audits
  const { data: expiredAudits, error: auditError } = await supabase
    .from("audits")
    .select("id")
    .lt("created_at", cutoff);

  if (auditError) throw auditError;

  let auditsDeleted = 0;
  for (const audit of expiredAudits ?? []) {
    try {
      await deleteAudit(audit.id);
      auditsDeleted++;
    } catch {
      // best-effort per audit
    }
  }

  // 2. Stale Figma connections (authorization expiry)
  const { data: staleConnections, error: connError } = await supabase
    .from("figma_connections")
    .select("id, user_id")
    .lt("updated_at", tokenCutoff);

  if (connError) throw connError;

  let connectionsDeleted = 0;
  for (const conn of staleConnections ?? []) {
    try {
      await deleteFigmaConnection(conn.user_id);
      connectionsDeleted++;
    } catch {
      // best-effort per connection
    }
  }

  return { auditsDeleted, connectionsDeleted };
}

/**
 * Recover audits whose execution was lost — a worker crash/restart, or a
 * network call that hangs without ever timing out (e.g. connecting to a
 * closed port) — and which the Inngest function therefore never got a
 * chance to mark "failed" itself. Anything stuck at status="running" past
 * `maxMinutes` (default STALE_AUDIT_MINUTES, well beyond
 * PAGE_SCAN_TIMEOUT_MS × MAX_PAGES worst case) is marked "failed" with
 * error_code "STALE_EXECUTION". Pass `auditId` to scope the check to one
 * row (used on each workbench poll); omit it for a system-wide sweep (used
 * by the retention cron) so audits nobody is actively polling still recover.
 * Returns the ids that were marked failed.
 */
export async function failStaleRunningAudits(
  opts: { auditId?: string; maxMinutes?: number } = {}
): Promise<string[]> {
  const maxMinutes =
    opts.maxMinutes ?? parseInt(process.env.STALE_AUDIT_MINUTES || "10", 10);
  const cutoff = new Date(Date.now() - maxMinutes * 60_000).toISOString();

  let query = supabase
    .from("audits")
    .select("id")
    .eq("status", "running")
    .lt("created_at", cutoff);

  if (opts.auditId) {
    query = query.eq("id", opts.auditId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const ids = ((data as { id: string }[] | null) ?? []).map((row) => row.id);

  for (const id of ids) {
    await updateAuditStatus(id, "failed", {
      error_code: "STALE_EXECUTION",
      error_detail: `No progress for over ${maxMinutes} minutes — execution likely lost (worker crash/restart) or a network operation hung without timing out.`,
    });
  }

  return ids;
}

/**
 * Delete an audit and everything tied to it (pages, findings via cascade,
 * and the evidence storage folder). Returns true if the audit existed.
 */
export async function deleteAudit(auditId: string): Promise<boolean> {
  // 1. Delete evidence from storage first (folder = auditId/).
  //    NOTE: storage.remove() matches exact object paths, not prefixes, so
  //    pass the full paths of every object under the folder. Best-effort:
  //    list → remove each; a missing folder is not an error.
  try {
    const { data: objects } = await supabase.storage
      .from("evidence")
      .list(auditId, { limit: 500 });

    if (objects && objects.length > 0) {
      const paths = objects.map((o) => `${auditId}/${o.name}`);
      await supabase.storage.from("evidence").remove(paths);
    }
  } catch {
    // best-effort — DB delete proceeds even if storage cleanup fails
  }

  // 2. Delete the audit row — findings + pages cascade (ON DELETE CASCADE)
  const { data, error } = await supabase
    .from("audits")
    .delete()
    .eq("id", auditId)
    .select("id");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function uploadEvidence(
  buffer: Buffer,
  path: string,
  contentType: string = "image/webp"
): Promise<string> {
  const { error } = await supabase.storage
    .from("evidence")
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    if (error.message?.includes("Quota")) {
      throw new Error("STORAGE_QUOTA");
    }
    throw error;
  }

  const { data } = supabase.storage
    .from("evidence")
    .getPublicUrl(path);

  return data.publicUrl;
}

/** Download raw bytes from the evidence bucket, or null if the object doesn't exist. */
export async function downloadEvidence(path: string): Promise<Buffer | null> {
  const { data, error } = await supabase.storage.from("evidence").download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** Invalidate a completed audit's cached PDF — call whenever findings for
 * that audit change after it was marked complete (e.g. a new Inspect-panel
 * contrast finding), so the next download regenerates instead of serving a
 * stale cache. Best-effort: a missing cache object is not an error. */
export async function invalidatePdfCache(auditId: string): Promise<void> {
  await supabase.storage.from("evidence").remove([`${auditId}/report-${auditId}.pdf`]);
}

export async function createSignedUrl(
  path: string,
  expiresIn = 3600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("evidence")
    .createSignedUrl(path, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}

// ─── Figma OAuth connections ──────────────────────────────────────────────

export interface FigmaConnection {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  figma_user_id: string | null;
  figma_user_name: string | null;
}

/** Fetch a user's saved Figma OAuth connection (null if not connected). */
export async function getFigmaConnection(
  userId: string
): Promise<FigmaConnection | null> {
  const { data, error } = await supabase
    .from("figma_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as FigmaConnection | null) ?? null;
}

/** Upsert a user's Figma OAuth connection after a successful exchange. */
export async function saveFigmaConnection(
  userId: string,
  token: {
    access_token: string;
    refresh_token?: string | null;
    expires_at?: string | null;
    figma_user_id?: string | null;
    figma_user_name?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("figma_connections").upsert(
    {
      user_id: userId,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      expires_at: token.expires_at ?? null,
      figma_user_id: token.figma_user_id ?? null,
      figma_user_name: token.figma_user_name ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
}

/** Remove a user's Figma connection (disconnect). */
export async function deleteFigmaConnection(userId: string): Promise<void> {
  const { error } = await supabase
    .from("figma_connections")
    .delete()
    .eq("user_id", userId);

  if (error) throw error;
}
