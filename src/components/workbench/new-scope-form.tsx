"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Platform } from "@/lib/types/scope";

interface NewScopeFormProps {
  onSubmit: (url: string, platform: Platform) => void;
  disabled?: boolean;
}

export function NewScopeForm({ onSubmit, disabled }: NewScopeFormProps) {
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<Platform>("web");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit(url.trim(), platform);
    setUrl("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        type="url"
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={disabled}
        className="flex-1"
      />
      <select
        value={platform}
        onChange={(e) => setPlatform(e.target.value as Platform)}
        disabled={disabled}
        className="rounded-md border bg-background px-3 py-2 text-sm"
      >
        <option value="web">Web</option>
        <option value="android">Android</option>
        <option value="ios">iOS</option>
      </select>
      <Button type="submit" disabled={disabled}>
        Add scope
      </Button>
    </form>
  );
}
