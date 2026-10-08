import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught", error, info);
  }
  reset = () => {
    this.setState({ error: null });
    try { window.location.reload(); } catch (_e) { /* ignore */ }
  };
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0a0d14] text-white flex items-center justify-center px-4" data-testid="error-boundary">
          <div className="max-w-md w-full rounded-2xl border border-white/10 bg-[#14181f] p-6 text-center">
            <h1 className="font-heading text-2xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-400">The page hit an unexpected error. We've logged it.</p>
            <pre className="mt-4 max-h-40 overflow-auto rounded bg-black/40 p-2 text-xs text-rose-300 text-left">{String(this.state.error?.message || this.state.error)}</pre>
            <button onClick={this.reset} className="mt-5 inline-flex items-center justify-center rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400" data-testid="error-boundary-reload">
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
