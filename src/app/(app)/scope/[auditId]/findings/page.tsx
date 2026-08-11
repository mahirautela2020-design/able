import type { Metadata } from "next";
import { Filters } from "@/components/workbench/filters";

export const metadata: Metadata = {
  title: "Findings — Able",
};

export default async function FindingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { auditId } = await params;
  const sp = await searchParams;
  const sourceFilter = (sp.source as string) || "all";

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Audit Findings</h1>
      <p className="text-muted-foreground mb-4">Audit ID: {auditId}</p>
      <Filters
        sourceFilter={sourceFilter as "all"}
        onSourceFilterChange={() => {}}
      />
      <div className="mt-4 text-muted-foreground">
        <p>Findings list will be populated by the audit engine.</p>
      </div>
    </div>
  );
}
