"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

/**
 * Auth-aware header action: shows "Sign in" when logged out,
 * the user's email + "Sign out" when logged in.
 */
export function AuthStatus() {
  const [user, setUser] = useState<{ email?: string } | null | undefined>(undefined);

  useEffect(() => {
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
        className="text-sm px-3 py-1.5 rounded-md border hover:bg-accent/50 transition-colors"
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
      <button
        onClick={() => supabase.auth.signOut()}
        className="text-sm px-3 py-1.5 rounded-md border hover:bg-accent/50 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
