import { createHash, randomBytes } from "node:crypto";
import { supabase } from "@/lib/supabase/server";
import type { OrgRole } from "@/lib/enterprise/rbac";

const API_KEY_PREFIX = "able_";
const API_KEY_LENGTH = 32;

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface ApiKeyRecord {
  id: string;
  org_id: string;
  created_by: string;
  name: string;
  prefix: string;
  key_hash: string;
  role: OrgRole;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface IssuedApiKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  role: OrgRole;
  expiresAt: string | null;
}

export async function issueApiKey(
  orgId: string,
  userId: string,
  name: string,
  role: OrgRole,
  expiresInDays?: number
): Promise<IssuedApiKey> {
  const rawKey = API_KEY_PREFIX + randomBytes(API_KEY_LENGTH).toString("base64url");
  const prefix = rawKey.slice(0, API_KEY_PREFIX.length + 8);
  const keyHash = hashKey(rawKey);

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
    : null;

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      org_id: orgId,
      created_by: userId,
      name,
      prefix,
      key_hash: keyHash,
      role,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name,
    key: rawKey,
    prefix,
    role,
    expiresAt,
  };
}

export async function verifyApiKey(key: string): Promise<ApiKeyRecord | null> {
  const keyHash = hashKey(key);

  const { data, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (error || !data) return null;

  const record = data as ApiKeyRecord;

  if (record.expires_at && new Date(record.expires_at) < new Date()) {
    return null;
  }

  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", record.id);

  return record;
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

export async function listApiKeys(orgId: string): Promise<Omit<ApiKeyRecord, "key_hash">[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, org_id, created_by, name, prefix, role, expires_at, revoked_at, last_used_at, created_at")
    .eq("org_id", orgId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Omit<ApiKeyRecord, "key_hash">[];
}
