import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Stops a render error from leaving the user on a blank page.
 *
 * React still requires a class component for this, because there is no hook
 * equivalent of `componentDidCatch`.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is the only place a client-side render error can be reported
    // to without a backend endpoint for it.
    console.error("Unhandled UI error", error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  private readonly handleDismiss = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            The console hit an unexpected error. Reloading usually clears it; if
            it keeps happening, the details are in the browser console.
          </p>
          <pre className="max-h-40 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <Button onClick={this.handleReload}>Reload</Button>
            <Button variant="secondary" onClick={this.handleDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
