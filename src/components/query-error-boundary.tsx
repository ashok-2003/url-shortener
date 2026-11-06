"use client";

import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type BoundaryProps = { children: ReactNode; message: string; onReset: () => void };
type BoundaryState = { failed: boolean };

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  private retry = () => {
    this.props.onReset();
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex flex-col items-start gap-3 py-4">
        <p>{this.props.message}</p>
        <Button type="button" variant="secondary" onClick={this.retry}>
          Retry
        </Button>
      </div>
    );
  }
}

export function QueryErrorBoundary({
  children,
  message,
}: {
  children: ReactNode;
  message: string;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <Boundary message={message} onReset={reset}>
          {children}
        </Boundary>
      )}
    </QueryErrorResetBoundary>
  );
}
