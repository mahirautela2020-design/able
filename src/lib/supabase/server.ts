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
  config: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await supabase
    .from("audits")
    .insert({
      target_url: targetUrl,
      config,
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
      "id, target_url, status, config, progress, report_path, error_code, error_detail, created_at, completed_at"
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

export async function getFindingsForAudit(auditId: string) {
  const { data, error } = await supabase
    .from("findings")
    .select("*")
    .eq("audit_id", auditId);

  if (error) throw error;
  return data;
}

export async function getRecentAudits(limit = 10) {
  const { data, error } = await supabase
    .from("audits")
    .select("id, target_url, status, created_at, progress")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

/**
 * Delete an audit and everything tied to it (pages, findings via cascade,
 * and the evidence storage folder). Returns true if the audit existed.
 */
export async function deleteAudit(auditId: string): Promise<boolean> {
  // 1. Delete evidence from storage first (folder = auditId/)
  const { error: storageError } = await supabase.storage
    .from("evidence")
    .remove([`${auditId}`]);

  if (storageError && !storageError.message?.includes("not found")) {
    throw storageError;
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
