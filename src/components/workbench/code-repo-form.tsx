"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, GitBranch } from "lucide-react";

interface CodeRepoFormProps {
  onSubmit: (repoUrl: string) => void;
  disabled?: boolean;
}

export function CodeRepoForm({ onSubmit, disabled }: CodeRepoFormProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    setLoading(true);
    try {
      onSubmit(repoUrl.trim());
      setRepoUrl("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        type="text"
        placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        disabled={disabled || loading}
        className="flex-1"
      />
      <Button type="submit" disabled={disabled || loading}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitBranch className="h-4 w-4" />
        )}
        <span className="ml-2">Add repo</span>
      </Button>
    </form>
  );
}
