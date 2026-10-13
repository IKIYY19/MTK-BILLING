import React from 'react';

/**
 * Section Error Boundary
 * Wraps individual sections/pages so one crash doesn't kill the whole app
 * Use this around heavy components like billing pages, charts, etc.
 */
class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[${this.props.sectionName || 'Section'}] Error:`, error, errorInfo.componentStack);
    
    // Check for chunk loading errors / failed dynamic imports
    const isChunkError = 
      error && 
      (error.message?.includes('Failed to fetch dynamically imported module') ||
       error.message?.includes('error loading dynamically imported module') ||
       error.name === 'ChunkLoadError');

    if (isChunkError) {
      const chunkErrorKey = 'chunk-load-reload-attempted';
      const lastAttempt = sessionStorage.getItem(chunkErrorKey);
      
      if (!lastAttempt) {
        sessionStorage.setItem(chunkErrorKey, 'true');
        window.location.reload();
        return;
      }
    }

    // Log to analytics/monitoring if available
    if (window.gtag) {
      window.gtag('event', 'exception', {
        description: `${this.props.sectionName}: ${error.message}`,
        fatal: false,
      });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              {this.props.sectionName || 'This section'} encountered an error
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Reload Page
              </button>
              <button
                onClick={() => window.history.back()}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm font-medium"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SectionErrorBoundary;
