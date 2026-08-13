"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";

/**
 * Auth-aware header action: shows "Sign in" when logged out,
 * the user's email + "Sign out" when logged in.
 */
export function AuthStatus() {
  const [user, setUser] = useState<{ email?: string } | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return; // env not configured (preview/dev) — stay logged-out
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (user === undefined) return null;

  if (!user) {
    return (
      <Link
        href="/auth"
        className="inline-flex items-center justify-center whitespace-nowrap shrink-0 h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] border-border bg-background hover:bg-muted hover:text-foreground"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground hidden sm:inline">
        {user.email}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => supabase?.auth.signOut()}
      >
        Sign out
      </Button>
    </div>
  );
}
