import { createClient } from "@supabase/supabase-js";

// Browser-side Supabase client (public anon key only — safe for client bundles).
// Used to read the active session token for authenticated API calls.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
