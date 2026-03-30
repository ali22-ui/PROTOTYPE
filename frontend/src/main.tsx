import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/app/index';
import 'leaflet/dist/leaflet.css';
import './index.css';

interface RootErrorBoundaryProps {
  children: React.ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  constructor(props: RootErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="grid min-h-screen place-items-center bg-white p-6">
        <div className="w-full max-w-2xl rounded-2xl border border-rose-200 bg-white p-6 shadow-lg">
          <h1 className="text-xl font-bold text-rose-700">UI runtime error detected</h1>
          <p className="mt-2 text-sm text-slate-600">
            The app encountered an unexpected error instead of rendering a blank screen.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            {String(this.state.error || 'Unknown error')}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);
