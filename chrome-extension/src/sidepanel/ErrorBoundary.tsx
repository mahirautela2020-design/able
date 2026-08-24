import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, any uncaught error in a tab (e.g. a chrome.* API call
 * failing in a way the local try/catch didn't anticipate) blank-screens
 * the entire side panel with no explanation — genuinely happened during
 * testing when a tab's effect ran before the extension context was fully
 * ready. Scoped per-tab in App.tsx so a crash in one tab doesn't take out
 * the other two.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[ScanA11y] tab crashed:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <p className="font-semibold text-destructive">Something went wrong in this tab.</p>
          <p className="mt-1 text-muted-foreground">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
