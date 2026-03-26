import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Runtime error captured by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-screen place-items-center bg-slate-100 p-6">
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

    return this.props.children;
  }
}
