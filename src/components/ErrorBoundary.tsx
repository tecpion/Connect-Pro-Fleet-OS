// Connect Pro Fleet — Build #20 app-level Error Boundary.
//
// Catches render-time crashes anywhere in the tree and shows a friendly
// "Something went wrong" screen with a Reload action instead of a blank page
// or a stack trace. Console keeps the error for development. Class component
// is required because React error boundaries must use getDerivedStateFromError.

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Keep details in the dev console; never expose to the user UI.
    console.error("Connect Pro Fleet — uncaught render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-status-out/10">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-status-out"
              >
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </div>
            <h1 className="font-display text-xl font-semibold text-foreground">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              An unexpected error occurred while loading this screen. Your data
              is safe — try reloading. If the problem continues, return to the
              dashboard.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                onClick={() => window.location.reload()}
                className="bg-primary text-primary-foreground hover:bg-primary-press"
              >
                Reload
              </Button>
              <Button
                variant="outline"
                onClick={() => (window.location.href = "/")}
              >
                Go to dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
