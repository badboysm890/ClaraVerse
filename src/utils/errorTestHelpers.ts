// Helper functions to test error boundaries from browser console
// These will be available as window.testErrors in development mode

export const errorTestHelpers = {
  // Test React Error Boundary
  triggerReactError: () => {
    // This will cause a React error by forcing a re-render with an error
    const event = new CustomEvent('test-react-error');
    window.dispatchEvent(event);
  },

  // Test Promise Rejection (Global Handler)
  triggerPromiseRejection: () => {
    Promise.reject(new Error('Test promise rejection from console'));
  },

  // Test JavaScript Error (Global Handler)
  triggerJSError: () => {
    // @ts-ignore - intentionally accessing undefined property
    const obj: any = null;
    obj.someProperty.doesNotExist();
  },

  // Test Async Error
  triggerAsyncError: async () => {
    throw new Error('Test async error from console');
  },

  // Test Network Error
  triggerNetworkError: () => {
    fetch('https://nonexistent-domain-12345.com/api/test')
      .catch(() => {
        throw new Error('Network error test');
      });
  },

  // Test Timeout Error
  triggerTimeoutError: () => {
    setTimeout(() => {
      throw new Error('Timeout error test');
    }, 1000);
  }
};

// Make available in development mode
if (import.meta.env.DEV) {
  (window as any).testErrors = errorTestHelpers;
  console.log('🧪 Error testing helpers available! Try:');
  console.log('testErrors.triggerReactError()');
  console.log('testErrors.triggerPromiseRejection()');
  console.log('testErrors.triggerJSError()');
  console.log('testErrors.triggerAsyncError()');
  console.log('testErrors.triggerNetworkError()');
  console.log('testErrors.triggerTimeoutError()');
} 
