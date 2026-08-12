import { supabase } from "@/lib/supabase/server";

/**
 * Lightweight session guard for API routes.
 * Requires a valid Supabase access token (Authorization: Bearer <jwt>).
 * Returns { ok: true, userId } or { ok: false, response } to return directly.
 */
export async function requireSession(
  request: Request
): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: Response }
> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: Response.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      ok: false,
      response: Response.json({ error: "Empty token" }, { status: 401 }),
    };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return {
      ok: false,
      response: Response.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      ),
    };
  }

  return { ok: true, userId: data.user.id };
}
