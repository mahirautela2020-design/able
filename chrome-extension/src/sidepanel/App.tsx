import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ErrorBoundary } from "./ErrorBoundary";
import { AuditTab } from "./tabs/AuditTab";
import { InspectTab } from "./tabs/InspectTab";
import { AccessibilityTab } from "./tabs/AccessibilityTab";

export function App() {
  return (
    <div className="h-screen flex flex-col bg-background text-foreground p-3 text-sm">
      <header className="flex items-center gap-2 mb-3 shrink-0">
        <div className="w-6 h-6 rounded-md bg-green-500 flex items-center justify-center text-[11px] font-bold text-black">
          ✓
        </div>
        <h1 className="text-sm font-semibold">ScanA11y</h1>
        <span className="ml-auto text-[10px] text-muted-foreground">
          No login · No history stored
        </span>
      </header>

      <Tabs defaultValue="audit" className="flex-1 min-h-0 flex flex-col gap-2">
        <TabsList className="w-full">
          <TabsTrigger value="audit" className="flex-1">
            Audit
          </TabsTrigger>
          <TabsTrigger value="inspect" className="flex-1">
            Inspect
          </TabsTrigger>
          <TabsTrigger value="a11y" className="flex-1">
            Accessibility
          </TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="flex-1 min-h-0 overflow-y-auto">
          <ErrorBoundary>
            <AuditTab />
          </ErrorBoundary>
        </TabsContent>
        <TabsContent value="inspect" className="flex-1 min-h-0 overflow-y-auto">
          <ErrorBoundary>
            <InspectTab />
          </ErrorBoundary>
        </TabsContent>
        <TabsContent value="a11y" className="flex-1 min-h-0 overflow-y-auto">
          <ErrorBoundary>
            <AccessibilityTab />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
