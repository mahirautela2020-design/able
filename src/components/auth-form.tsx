"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Mode = "signin" | "signup";

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@") || !trimmed.includes(".")) {
      toast.error("Enter a valid email address");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      if (!supabase) throw new Error("Authentication is not configured");
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        });
        if (error) throw error;
        toast.success("Signed in");
        router.push("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: trimmed,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;

        // autoconfirm is on → a session is issued immediately; if the email
        // already exists, no session comes back — tell the user to sign in.
        if (!data.session) {
          toast.info("Account already exists — signing you in instead.");
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: trimmed,
            password,
          });
          if (signInError) throw signInError;
        }
        toast.success("Signed in");
        router.push("/");
        router.refresh();
      }
    } catch (e) {
      const msg = (e as Error).message;
      // Supabase's default "signup" email-taken error is confusing — map it.
      if (/already registered|already been registered|user already/i.test(msg)) {
        toast.error("That email is already registered — try signing in.");
        setMode("signin");
      } else if (/invalid login credentials/i.test(msg)) {
        toast.error("Incorrect email or password.");
      } else {
        toast.error(msg || "Authentication failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{mode === "signin" ? "Sign in" : "Create free account"}</CardTitle>
        <CardDescription>
          {mode === "signin"
            ? "Welcome back. Connect Figma and manage your audits."
            : "Free forever for 5 audits/day. No email confirmation needed."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            autoComplete="email"
            required
          />
          <Input
            type="password"
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={8}
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <p className="text-sm text-muted-foreground mt-4 text-center">
          {mode === "signin" ? (
            <>
              New here?{" "}
              <Button
                type="button"
                variant="link"
                className="px-1 h-auto text-sm whitespace-nowrap"
                onClick={() => setMode("signup")}
              >
                Create a free account
              </Button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Button
                type="button"
                variant="link"
                className="px-1 h-auto text-sm whitespace-nowrap"
                onClick={() => setMode("signin")}
              >
                Sign in
              </Button>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
