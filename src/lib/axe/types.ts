export interface AxNode {
  name: string;
  role: string;
  children: AxNode[];
  level?: number;
  properties?: Record<string, unknown>;
}

export interface AxSnapshot {
  name: string;
  role: string;
  children: AxNode[];
}

export function isAxNode(value: unknown): value is AxNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  return (
    typeof node.name === "string" &&
    typeof node.role === "string" &&
    Array.isArray(node.children)
  );
}

export function isAxSnapshot(value: unknown): value is AxSnapshot {
  if (!value || typeof value !== "object") return false;
  const snap = value as Record<string, unknown>;
  return (
    typeof snap.name === "string" &&
    typeof snap.role === "string" &&
    Array.isArray(snap.children)
  );
}

export interface FindingRow {
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
}

export interface AuditRowLite {
  id: string;
  target_url: string;
  status: string;
  created_at: string;
  completed_at?: string | null;
  config?: Record<string, unknown>;
  progress?: Record<string, unknown>;
}

export interface ScopePageRow {
  id: string;
  audit_id: string;
  page_url: string;
  page_title: string | null;
  status: string;
  wcag_score: number | null;
}
