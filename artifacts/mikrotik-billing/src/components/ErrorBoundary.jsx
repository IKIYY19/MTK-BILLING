import React from 'react';

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays fallback UI
 * Prevents white screen of death
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('🔴 Error Boundary caught an error:', error);
      console.error('Component stack:', errorInfo.componentStack);
    }

    // Check for chunk loading errors / failed dynamic imports
    const isChunkError = 
      error && 
      (error.message?.includes('Failed to fetch dynamically imported module') ||
       error.message?.includes('error loading dynamically imported module') ||
       error.name === 'ChunkLoadError');

    if (isChunkError) {
      const chunkErrorKey = 'chunk-load-reload-attempted';
      const lastAttempt = sessionStorage.getItem(chunkErrorKey);
      
      // If we haven't attempted a reload in this session yet, do it automatically
      if (!lastAttempt) {
        sessionStorage.setItem(chunkErrorKey, 'true');
        window.location.reload();
        return;
      }
    }

    // Report to Sentry for production monitoring
    try {
      const { captureError } = require('../services/sentry');
      captureError(error, {
        componentStack: errorInfo.componentStack,
        location: window.location.href,
      });
    } catch (e) {
      // Sentry might not be initialized, ignore
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-red-500/20 rounded-2xl p-8 max-w-2xl w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Application Error</h2>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-300 font-mono break-all">
                {this.state.error ? this.state.error.toString() : 'Unknown error'}
              </p>
            </div>

            <p className="text-sm text-zinc-400 mb-4">
              The application encountered an unexpected error. Try these steps:
            </p>

            <div className="space-y-3">
              <button
                onClick={() => {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.href = '/login';
                }}
                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Clear All Data & Login (Recommended)
              </button>

              <button
                onClick={this.handleReset}
                className="w-full px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm font-medium"
              >
                Return to Dashboard
              </button>

              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm font-medium"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
