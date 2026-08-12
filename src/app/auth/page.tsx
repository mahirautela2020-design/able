import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Sign in — ScanA11y",
};

export default function AuthPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <AuthForm />
    </div>
  );
}
