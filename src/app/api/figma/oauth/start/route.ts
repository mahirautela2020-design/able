import { requireSession } from "@/lib/supabase/session";
import { randomBytes } from "crypto";

const FIGMA_CLIENT_ID = process.env.FIGMA_CLIENT_ID;

/**
 * GET /api/figma/oauth/start — begin the Figma OAuth2 authorization flow.
 * Requires a logged-in session. Redirects the user's browser to Figma's
 * consent screen; on approval Figma redirects back to /api/figma/oauth/callback.
 *
 * CSRF protection: we issue `state = userId:nonce`, set the nonce in a
 * short-lived httpOnly cookie, and verify both on the callback.
 *
 * The redirect URI MUST be registered in the Figma dev app settings:
 *   https://<your-app>/api/figma/oauth/callback
 */
export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  if (!FIGMA_CLIENT_ID) {
    return Response.json(
      { error: "FIGMA_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/figma/oauth/callback`;

  const nonce = randomBytes(24).toString("hex");
  const state = `${auth.userId}:${nonce}`;

  const params = new URLSearchParams({
    client_id: FIGMA_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "files:read",
    state,
  });

  const url = `https://www.figma.com/oauth?${params.toString()}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // httpOnly + SameSite=Lax: the cookie survives the Figma redirect
      // round-trip but is not readable by JS (CSRF/XSS hardened).
      "Set-Cookie": `scana11y_figma_state=${encodeURIComponent(
        state
      )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    },
  });
}
