"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModuleSelector } from "@/components/audit/ModuleSelector";
import { AuditPresets } from "@/components/audit/AuditPresets";
import {
  AUDIT_MODULES,
  getModuleWcagCoverage,
  totalEstimatedRuntime,
  formatRuntime,
  getPresetById,
  getRequiredModuleIds,
  type ModuleSelection,
} from "@/lib/audit-modules";
import { ArrowLeft, Search } from "lucide-react";

function buildDefaultSelection(): ModuleSelection[] {
  const standardPreset = getPresetById("standard");
  const requiredIds = getRequiredModuleIds();
  const presetIds = standardPreset?.moduleIds ?? [];

  return AUDIT_MODULES.map((m) => ({
    moduleId: m.id,
    enabled: requiredIds.includes(m.id) || presetIds.includes(m.id),
  }));
}

export default function AuditConfigPage() {
  const [selected, setSelected] = useState<ModuleSelection[]>(buildDefaultSelection);
  const [activePreset, setActivePreset] = useState<string | null>("standard");
  const [url, setUrl] = useState("");

  function handlePresetSelect(presetId: string) {
    const preset = getPresetById(presetId);
    if (!preset) return;

    const requiredIds = getRequiredModuleIds();
    const presetIds = new Set([...requiredIds, ...preset.moduleIds]);

    setActivePreset(presetId);
    setSelected(
      AUDIT_MODULES.map((m) => ({
        moduleId: m.id,
        enabled: presetIds.has(m.id),
      }))
    );
  }

  const enabledIds = selected.filter((s) => s.enabled).map((s) => s.moduleId);
  const coverage = getModuleWcagCoverage(enabledIds);
  const runtime = totalEstimatedRuntime(enabledIds);

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-12">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to audits
        </Link>
      </div>

      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">New Audit</h1>
          <p className="text-muted-foreground mt-1">
            Configure which accessibility modules to run and set the target URL.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Target URL</CardTitle>
            <CardDescription>
              Enter a public URL or select a saved portal session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1"
              />
              <Button disabled={!url.trim()}>
                <Search className="h-4 w-4" />
                <span className="ml-2">Start Audit</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Presets</CardTitle>
            <CardDescription>
              Choose a preset to get started, then customize below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AuditPresets
              selectedPresetId={activePreset}
              onSelect={handlePresetSelect}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Modules</CardTitle>
            <CardDescription>
              Toggle individual audit modules. Required modules (Automated, Needs Review) cannot be disabled.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ModuleSelector selected={selected} onChange={setSelected} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Modules</p>
                <p className="text-xl font-bold">{enabledIds.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">WCAG SCs Covered</p>
                <p className="text-xl font-bold">{coverage.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Est. Runtime</p>
                <p className="text-xl font-bold">
                  {runtime > 0 ? formatRuntime(runtime) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Preset</p>
                <p className="text-xl font-bold capitalize">
                  {activePreset ?? "Custom"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
