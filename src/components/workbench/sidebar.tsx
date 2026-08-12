"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck,
  FileSearch,
  Layers,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export function Sidebar({ auditId }: { auditId: string }) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { label: "Scope", href: `/scope/${auditId}`, icon: ClipboardCheck },
    { label: "Findings", href: `/scope/${auditId}/findings`, icon: FileSearch },
    { label: "AX Snapshots", href: `/scope/${auditId}/snapshots/page-001`, icon: Layers },
    { label: "Explore", href: `/scope/${auditId}/explore`, icon: ScanSearch },
  ];

  return (
    <aside className="w-64 border-r bg-muted/30 h-full flex flex-col shrink-0">
      <div className="p-4 border-b">
        <Link href="/" className="text-lg font-bold tracking-tight">
          ScanA11y
        </Link>
        <p className="text-xs text-muted-foreground mt-1">
          Accessibility Auditor
        </p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
