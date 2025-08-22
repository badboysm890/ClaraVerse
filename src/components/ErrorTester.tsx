import React, { useState, useEffect } from 'react';

const ErrorTester: React.FC = () => {
  const [shouldThrowError, setShouldThrowError] = useState(false);

  // Listen for console-triggered React error test
  useEffect(() => {
    const handleTestReactError = () => {
      setShouldThrowError(true);
    };

    window.addEventListener('test-react-error', handleTestReactError);
    return () => window.removeEventListener('test-react-error', handleTestReactError);
  }, []);

  // This will trigger a React Error Boundary
  const triggerReactError = () => {
    setShouldThrowError(true);
  };

  // This will trigger a promise rejection (global error handler)
  const triggerPromiseRejection = () => {
    Promise.reject(new Error('Test promise rejection'));
  };

  // This will trigger a JavaScript error (global error handler)
  const triggerJSError = () => {
    // @ts-ignore - intentionally accessing undefined property
    const obj: any = null;
    obj.someProperty.doesNotExist();
  };

  // This will trigger an async error
  const triggerAsyncError = async () => {
    throw new Error('Test async error');
  };

  // If shouldThrowError is true, this will throw an error during render
  if (shouldThrowError) {
    throw new Error('Test React Error Boundary - This is intentional!');
  }

  return (
    <div className="p-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
      <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-4">
        🧪 Error Testing Panel (Development Only)
      </h3>
      <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">
        Use these buttons to test different error scenarios and see how the error boundaries handle them:
      </p>
      
      <div className="space-y-3">
        <button
          onClick={triggerReactError}
          className="w-full bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-md transition-colors"
        >
          🔥 Trigger React Error (Error Boundary)
        </button>
        
        <button
          onClick={triggerPromiseRejection}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 px-4 rounded-md transition-colors"
        >
          ⚡ Trigger Promise Rejection (Global Handler)
        </button>
        
        <button
          onClick={triggerJSError}
          className="w-full bg-purple-500 hover:bg-purple-600 text-white font-medium py-2 px-4 rounded-md transition-colors"
        >
          💥 Trigger JavaScript Error (Global Handler)
        </button>
        
        <button
          onClick={() => triggerAsyncError().catch(() => {})}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white font-medium py-2 px-4 rounded-md transition-colors"
        >
          🌊 Trigger Async Error (Global Handler)
        </button>
      </div>
      
      <div className="mt-4 text-xs text-yellow-600 dark:text-yellow-400">
        <p><strong>Note:</strong> These buttons are for testing purposes only.</p>
        <p>• React Error → Shows the ErrorBoundary component</p>
        <p>• Other errors → Shows the global error overlay</p>
        <p>• Console helpers also available: <code>testErrors.triggerReactError()</code></p>
      </div>
    </div>
  );
};

export default ErrorTester; 
