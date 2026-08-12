import { saveFigmaConnection } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

const FIGMA_CLIENT_ID = process.env.FIGMA_CLIENT_ID;
const FIGMA_CLIENT_SECRET = process.env.FIGMA_CLIENT_SECRET;
const FIGMA_TOKEN_URL = "https://api.figma.com/v1/oauth/token";

/**
 * GET /api/figma/oauth/callback — Figma redirects here after the user
 * approves (or declines) the consent screen.
 *
 * 1. Verify the `state` round-trip (CSRF): we issued `userId:nonce` in /start
 *    and set the same nonce in a short-lived cookie. Both must match.
 * 2. Exchange `?code=` for an access token using the client secret
 *    (server-side only — the secret never leaves the server).
 * 3. Store the token per-user in Supabase (figma_connections).
 * 4. Redirect the browser back to the app with a success/failure flag.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";

  if (!code) {
    return redirectHome("figma=error&reason=no_code");
  }
  if (!FIGMA_CLIENT_ID || !FIGMA_CLIENT_SECRET) {
    return redirectHome("figma=error&reason=not_configured");
  }

  // ── CSRF check: state cookie must match the `userId:nonce` we issued ──
  const cookie = request.headers.get("cookie") ?? "";
  const stateMatch = cookie.match(/scana11y_figma_state=([^;]+)/);
  const issuedState = stateMatch ? decodeURIComponent(stateMatch[1]) : "";
  if (!issuedState || issuedState !== state) {
    return redirectHome("figma=error&reason=state_mismatch");
  }

  const [userId] = state.split(":");
  if (!userId) {
    return redirectHome("figma=error&reason=bad_state");
  }

  try {
    // ── Exchange code → access token (server-side, uses client secret) ──
    const origin = new URL(request.url).origin;
    const tokenRes = await fetch(FIGMA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: FIGMA_CLIENT_ID,
        client_secret: FIGMA_CLIENT_SECRET,
        redirect_uri: `${origin}/api/figma/oauth/callback`,
        code,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      console.error("Figma token exchange failed:", tokenRes.status, body.slice(0, 200));
      return redirectHome("figma=error&reason=token_exchange");
    }

    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    // ── Store per-user (upsert on user_id) ──
    const expiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null;

    await saveFigmaConnection(userId, {
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      expires_at: expiresAt,
    });

    return redirectHome("figma=success");
  } catch (e) {
    console.error("Figma OAuth callback error:", e);
    return redirectHome("figma=error&reason=internal");
  }
}

function redirectHome(query: string): Response {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return Response.redirect(`${origin}/?${query}`, 302);
}

/** Issue a fresh nonce — used by /start to sign the state cookie. */
export function issueStateNonce(): string {
  return randomBytes(24).toString("hex");
}
