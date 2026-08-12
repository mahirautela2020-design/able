"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";

/**
 * "Connect Figma" — enterprise OAuth2 entry point.
 *
 * Flow:
 *  1. Read the browser session (Supabase anon client).
 *  2. If signed in, call /api/figma/oauth/start with the Bearer token and
 *     redirect: 'manual' — the route responds 302 with Location: figma.com/oauth
 *     and sets a short-lived CSRF state cookie.
 *  3. Navigate the browser to that Location. Figma shows the consent screen;
 *     after approval it redirects to /api/figma/oauth/callback, which
 *     exchanges the code server-side and stores the per-user token.
 *
 * Without a session the button shows the enterprise "sign in required" state
 * (auth arrives with the P6 enterprise shell).
 */
export function ConnectFigmaButton() {
  const [session, setSession] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(Boolean(data.session));
    });
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      if (!s) {
        // No browser session — take the user to the sign-in page.
        window.location.href = "/auth";
        return;
      }

      const res = await fetch("/api/figma/oauth/start", {
        headers: { Authorization: `Bearer ${s.access_token}` },
        redirect: "manual",
      });

      if (res.status === 401) {
        setError("Session expired — please sign in again.");
        return;
      }

      const location = res.headers.get("location");
      if (!location) {
        setError("Figma OAuth is not configured (FIGMA_CLIENT_ID).");
        return;
      }

      // Navigate to Figma's consent screen (cookie already set for callback).
      window.location.href = location;
    } catch {
      setError("Failed to start Figma connection.");
    } finally {
      setConnecting(false);
    }
  }

  if (session === null) {
    return (
      <Button variant="outline" size="sm" disabled>
        Checking session…
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        onClick={handleConnect}
        disabled={connecting}
        size="sm"
        className="bg-[#0d99ff] hover:bg-[#0b85e0] text-white"
      >
        <FigmaIcon />
        {connecting ? "Redirecting to Figma…" : "Connect Figma"}
      </Button>
      {error && <p className="text-xs text-destructive max-w-[220px]">{error}</p>}
    </div>
  );
}

function FigmaIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 38 57" fill="none" aria-hidden="true">
      <path fill="#1ABCFE" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
      <path fill="#0ACF83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
      <path fill="#FF7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
      <path fill="#F24E1E" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
      <path fill="#A259FF" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
    </svg>
  );
}
