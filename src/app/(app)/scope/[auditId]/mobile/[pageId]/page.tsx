import type { Metadata } from "next";
import { MobileSimulator } from "./MobileSimulator";

export const metadata: Metadata = {
  title: "Mobile View — Able",
};

export default async function MobilePage({
  params,
}: {
  params: Promise<{ auditId: string; pageId: string }>;
}) {
  const { auditId, pageId } = await params;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Mobile View</h1>
      <p className="text-muted-foreground mb-4">
        Audit ID: {auditId} | Page ID: {pageId}
      </p>
      <MobileSimulator auditId={auditId} pageId={pageId} />
    </div>
  );
}
