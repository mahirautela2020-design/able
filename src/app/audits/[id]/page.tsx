import { ReportViewer } from "@/components/ReportViewer";

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-12">
      <ReportViewer auditId={id} />
    </div>
  );
}
