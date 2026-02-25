import { Component, type ReactNode, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-red-600">Something went wrong</h2>
          <pre className="text-sm bg-red-50 border border-red-200 rounded p-4 overflow-auto whitespace-pre-wrap">
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            className="text-sm text-blue-600 underline"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AppLayout() {
  const { pathname } = useLocation();

  // Radix UI Dialog adds pointer-events:none to document.body when open.
  // If a dialog unmounts without closing (navigation, logout), it stays stuck.
  // Clean it up on every route change so pages are never left unclickable.
  useEffect(() => {
    document.body.style.removeProperty('pointer-events');
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
