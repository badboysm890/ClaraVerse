import { Component, ErrorInfo, ReactNode } from 'react';
import errorClaraMascot from '../assets/mascot/Error_Clara.png';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Update state with error details
    this.setState({
      error,
      errorInfo
    });
  }

  handleHardRefresh = () => {
    // Clear any cached data and reload the page
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  handleSoftRefresh = () => {
    // Just reset the error boundary state
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-100 dark:from-gray-900 dark:via-purple-900 dark:to-indigo-900 flex items-center justify-center p-4 relative overflow-hidden">
          {/* Animated background elements */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
            <div className="absolute top-40 left-40 w-80 h-80 bg-indigo-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
          </div>

          <div className="relative max-w-4xl w-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/20">
            <div className="flex flex-col lg:flex-row items-center gap-8">
              
              {/* Clara Character Section */}
              <div className="flex-shrink-0 relative">
                {/* Clara mascot image */}
                <div className="w-80 h-80 relative">
                  <img 
                    src={errorClaraMascot} 
                    alt="Clara Error Mascot" 
                    className="w-full h-full object-contain drop-shadow-2xl"
                    onError={() => {
                      // Fallback to Bot icon from lucide-react if mascot fails
                      console.warn('Failed to load Clara mascot, no fallback available');
                    }}
                  />
                  
                  {/* Floating elements around Clara */}
                  <div className="absolute -top-2 -left-2 w-6 h-6 bg-yellow-300 rounded-full animate-bounce"></div>
                  <div className="absolute top-8 -right-8 w-4 h-4 bg-pink-300 rounded-full animate-bounce animation-delay-1000"></div>
                  <div className="absolute -bottom-4 right-4 w-5 h-5 bg-purple-300 rounded-full animate-bounce animation-delay-2000"></div>
                </div>
              </div>

              {/* Clara's Speech Section */}
              <div className="flex-1 space-y-6">
                {/* Speech bubble container */}
                <div className="relative bg-white dark:bg-gray-700 rounded-2xl p-6 shadow-lg border-2 border-pink-200 dark:border-pink-600">
                  {/* Speech bubble tail */}
                  <div className="absolute left-0 top-8 w-0 h-0 border-t-[15px] border-t-transparent border-b-[15px] border-b-transparent border-r-[20px] border-r-white dark:border-r-gray-700 -ml-5"></div>
                  
                  {/* Clara's message */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-3 h-3 bg-pink-500 rounded-full"></div>
                      <h2 className="text-xl font-bold text-gray-800 dark:text-white">Clara speaking...</h2>
                      <div className="w-3 h-3 bg-pink-500 rounded-full"></div>
                    </div>
                    
                    <p className="text-lg text-gray-700 dark:text-gray-200 leading-relaxed">
                      "Oh no! Something unexpected happened in ClaraVerse! 😅"
                    </p>
                    
                    <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed">
                      "Don't worry though! I'm here to help you get back on track. These things happen sometimes when we're exploring new digital worlds together!"
                    </p>
                    
                    <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-4 border-l-4 border-pink-400">
                      <p className="text-sm text-pink-700 dark:text-pink-300 italic">
                        💡 "I recommend using the Hard Refresh button - it's like giving ClaraVerse a fresh start! It'll clear any confused data and we can begin again."
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action buttons with Clara's personality */}
                <div className="space-y-3">
                  <button
                    onClick={this.handleHardRefresh}
                    className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg flex items-center justify-center space-x-3"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>✨ Clara's Hard Refresh (Recommended)</span>
                  </button>
                  
                  <button
                    onClick={this.handleSoftRefresh}
                    className="w-full bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg flex items-center justify-center space-x-3"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>🔄 Try Again (Quick Fix)</span>
                  </button>
                </div>

                {/* Clara's encouraging message */}
                <div className="text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    "Remember, every great adventure has its little bumps! Let's get back to exploring together! 🌟"
                  </p>
                </div>
              </div>
            </div>

            {/* Error Details (Development Only) - styled as Clara's technical notes */}
            {import.meta.env.DEV && this.state.error && (
              <div className="mt-8 border-t border-gray-200 dark:border-gray-600 pt-6">
                <details className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                  <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <span>🔧</span>
                    Clara's Technical Notes (Development Mode)
                    <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-2 py-1 rounded-full">DEV</span>
                  </summary>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-3 mt-3">
                    <div className="bg-white dark:bg-gray-700 rounded-lg p-3">
                      <strong className="text-red-600 dark:text-red-400">Error Message:</strong>
                      <p className="mt-1 font-mono text-xs">{this.state.error.message}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-700 rounded-lg p-3">
                      <strong className="text-blue-600 dark:text-blue-400">Stack Trace:</strong>
                      <pre className="mt-1 text-xs bg-gray-100 dark:bg-gray-600 p-2 rounded overflow-auto max-h-32">
                        {this.state.error.stack}
                      </pre>
                    </div>
                    {this.state.errorInfo && (
                      <div className="bg-white dark:bg-gray-700 rounded-lg p-3">
                        <strong className="text-purple-600 dark:text-purple-400">Component Stack:</strong>
                        <pre className="mt-1 text-xs bg-gray-100 dark:bg-gray-600 p-2 rounded overflow-auto max-h-32">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 