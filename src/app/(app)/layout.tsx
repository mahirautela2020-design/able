import type { Metadata } from "next";
import { Sidebar } from "@/components/workbench/sidebar";

export const metadata: Metadata = {
  title: "ScanA11y — Workbench",
  description: "Accessibility audit workbench",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex h-full">
      <Sidebar auditId="" />
      <main className="flex-1 overflow-y-auto min-h-0">
        {children}
      </main>
    </div>
  );
}
