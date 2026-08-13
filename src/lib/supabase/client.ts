import { createClient } from "@supabase/supabase-js";

// Browser-side Supabase client (public anon key only — safe for client bundles).
// Used to read the active session token for authenticated API calls.
//
// ROBUSTNESS: env vars may be absent in preview/dev builds or local setups
// without .env.local. A missing URL must NOT crash module evaluation (that
// breaks prerendering). We build the client lazily and export a null-safe
// facade — callers check `supabase.auth` availability or use
// `supabaseClient()` and handle null.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const configured = supabaseUrl.startsWith("http") && supabaseAnonKey.length > 0;

/** The real client when env is configured, otherwise null. */
export const supabase = configured ? createClient(supabaseUrl, supabaseAnonKey) : null;

/** Safe accessor — returns null when Supabase env is not configured. */
export function supabaseClient() {
  return supabase;
}

/**
 * Headers for authenticated API calls: attaches the session Bearer token
 * when a session exists, else empty. Callers pass this to fetch so
 * owner-scoped routes accept the request (works even on localhost where
 * no x-forwarded-for exists for the anonymous IP fallback).
 */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}
