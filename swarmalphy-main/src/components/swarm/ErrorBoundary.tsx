import { Component, type ReactNode } from "react";

interface Props {
  name: string;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.name}] CRASHED:`, error.message, error.stack?.slice(0, 300));
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm">
          <span className="font-bold text-red-400">💥 {this.props.name}</span>
          <pre className="mt-1 text-xs text-red-300 whitespace-pre-wrap">{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
