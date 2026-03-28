import React from "react";

type BoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, BoundaryState> {
  public state: BoundaryState = {
    error: null,
  };

  public static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error) {
    console.error("ForgeSheet render failure", error);
  }

  public render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#111318] px-6 py-10 text-[#f5efdf]">
          <div className="mx-auto max-w-3xl rounded-[28px] border border-white/10 bg-[#20242c] p-8 shadow-forge">
            <p className="text-xs uppercase tracking-[0.3em] text-forge-sky">ForgeSheet Recovery</p>
            <h1 className="mt-4 font-display text-3xl text-forge-mist">The builder hit an unexpected error.</h1>
            <p className="mt-4 text-sm text-white/75">
              The app stayed up, but one render path failed. The error details are below so the issue is visible instead of turning into a blank screen.
            </p>
            <pre className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-white/75">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
